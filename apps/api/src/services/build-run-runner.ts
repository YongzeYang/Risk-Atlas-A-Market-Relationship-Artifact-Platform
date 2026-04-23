import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

import { ArtifactStorageKind, BuildSeriesStatus } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import {
  ARTIFACT_BUNDLE_VERSION,
  ARTIFACT_FILE_NAMES,
  ISO_DATE_PATTERN_SOURCE,
  MANIFEST_FORMAT,
  MIN_BUILD_UNIVERSE_SIZE,
  PREVIEW_FORMAT,
  TOP_PAIR_LIMIT,
  isBuildRunScoreMethod,
  isBuildRunWindowDays,
  type BuildRunScoreMethod,
  type BuildRunWindowDays,
  type ManifestV1,
  type PreviewV1,
  type TopPairItem
} from '../contracts/build-runs.js';
import {
  clearIncrementalBsmBuildProgress,
  openIncrementalBsmMatrixArtifactWriter,
  resolveIncrementalBsmResumeState,
  type IncrementalBsmMatrixArtifactWriter
} from './bsm-writer.js';
import {
  ensureLocalMatrixArtifactPath,
  resolveConfiguredArtifactStorageKind,
  uploadLocalArtifactBundleToS3
} from './artifact-store.js';
import {
  cleanupLocalArtifactBundle,
  getLocalArtifactBundlePaths,
  prepareLocalArtifactBundle,
  statFileByteSize,
  writeJsonFile,
  writeManifestJsonStable
} from './local-artifact-store.js';
import {
  createPairwiseScoreRowBuilder,
  type PairwiseScoreRowBuilder
} from './correlation-analytics.js';
import { prepareCorrelationInputs } from './correlation-preparation-service.js';
import { compareTopPairItems } from './score-method-spec.js';
import { computeBuildStructureSummary } from './structure-service.js';
import { resolveUniverseSymbols } from './universe-resolver.js';

type PreparedScoreBuild = {
  symbolOrder: string[];
  rowBuilder: PairwiseScoreRowBuilder;
  symbolStateHashes: string[];
};

type IncrementalParentBuild = {
  buildRunId: string;
  matrixPath: string;
  seedRows: number;
};

const queuedOrRunningBuildRunIds = new Set<string>();
const isoDateRegex = new RegExp(ISO_DATE_PATTERN_SOURCE);

export function scheduleBuildRun(buildRunId: string): void {
  if (queuedOrRunningBuildRunIds.has(buildRunId)) {
    return;
  }

  queuedOrRunningBuildRunIds.add(buildRunId);

  setImmediate(() => {
    void runBuildInternal(buildRunId);
  });
}

export async function runBuild(buildRunId: string): Promise<void> {
  await runBuildInternal(buildRunId);
}

export async function resumePendingBuildRuns(): Promise<void> {
  const pendingRuns = await prisma.buildRun.findMany({
    where: {
      status: {
        in: ['pending', 'running']
      }
    },
    select: {
      id: true
    },
    orderBy: {
      createdAt: 'asc'
    },
    take: 500
  });

  for (const run of pendingRuns) {
    scheduleBuildRun(run.id);
  }
}

async function runBuildInternal(buildRunId: string): Promise<void> {
  try {
    const existingBuildState = await prisma.buildRun.findUnique({
      where: {
        id: buildRunId
      },
      select: {
        status: true,
        startedAt: true
      }
    });

    if (!existingBuildState) {
      return;
    }

    if (existingBuildState.status === 'succeeded' || existingBuildState.status === 'failed') {
      return;
    }

    const allowResume = existingBuildState.status === 'running';

    if (existingBuildState.status === 'pending') {
      const claimed = await prisma.buildRun.updateMany({
        where: {
          id: buildRunId,
          status: 'pending'
        },
        data: {
          status: 'running',
          startedAt: new Date(),
          finishedAt: null,
          errorMessage: null
        }
      });

      if (claimed.count === 0) {
        return;
      }
    } else if (!existingBuildState.startedAt) {
      await prisma.buildRun.update({
        where: {
          id: buildRunId
        },
        data: {
          startedAt: new Date(),
          finishedAt: null,
          errorMessage: null
        }
      });
    }

    const buildRun = await prisma.buildRun.findUnique({
      where: {
        id: buildRunId
      },
      include: {
        dataset: true,
        universe: true
      }
    });

    if (!buildRun) {
      throw new Error(`Build run "${buildRunId}" was not found after it was claimed.`);
    }

    if (!isoDateRegex.test(buildRun.asOfDate)) {
      throw new Error(`Build run "${buildRunId}" has invalid asOfDate "${buildRun.asOfDate}".`);
    }

    if (!isBuildRunWindowDays(buildRun.windowDays)) {
      throw new Error(
        `Build run "${buildRunId}" has unsupported windowDays "${buildRun.windowDays}".`
      );
    }

    if (!isBuildRunScoreMethod(buildRun.scoreMethod)) {
      throw new Error(
        `Build run "${buildRunId}" has unsupported scoreMethod "${buildRun.scoreMethod}".`
      );
    }

    const scoreMethod: BuildRunScoreMethod = buildRun.scoreMethod;
    const windowDays: BuildRunWindowDays = buildRun.windowDays;
    const resolvedUniverseSymbols = await resolveUniverseSymbols(
      buildRun.universe,
      buildRun.datasetId,
      buildRun.asOfDate,
      { minimumRows: windowDays + 1 }
    );

    const prepared = await buildCorrelationArtifactData({
      datasetId: buildRun.datasetId,
      symbolOrder: resolvedUniverseSymbols,
      asOfDate: buildRun.asOfDate,
      windowDays,
      scoreMethod
    });

    const symbolSetHash = computeSymbolSetHash(prepared.symbolOrder);
    const sourceDatasetMaxTradeDate = buildRun.dataset.catalogMaxTradeDate;
    const incrementalParent = await resolveIncrementalParentBuild({
      buildRunId: buildRun.id,
      datasetId: buildRun.datasetId,
      universeId: buildRun.universeId,
      asOfDate: buildRun.asOfDate,
      windowDays,
      scoreMethod,
      symbolOrder: prepared.symbolOrder,
      symbolStateHashes: prepared.symbolStateHashes
    });

    let artifactPaths = getLocalArtifactBundlePaths(buildRunId);
    const resumeState = await resolveIncrementalBsmResumeState({
      progressPath: artifactPaths.progressPath,
      allowResume,
      metadata: {
        buildRunId: buildRun.id,
        symbolSetHash,
        asOfDate: buildRun.asOfDate,
        scoreMethod,
        windowDays,
        sourceDatasetMaxTradeDate,
        symbolCount: prepared.symbolOrder.length
      }
    });

    if (resumeState.resetReason && allowResume) {
      console.warn(
        `[build-run:${buildRun.id}] resetting incremental progress and restarting from row 0: ${resumeState.resetReason}`
      );
    }

    if (resumeState.startRow === 0) {
      artifactPaths = await prepareLocalArtifactBundle(buildRunId);
    } else {
      await mkdir(artifactPaths.buildDir, { recursive: true });
    }

    // Store the final symbol snapshot after filtering out unusable series.
    await prisma.buildRun.update({
      where: { id: buildRunId },
      data: {
        buildStrategy: incrementalParent ? 'incremental' : 'full',
        previousBuildRunId: incrementalParent?.buildRunId ?? null,
        sourceDatasetMaxTradeDate,
        symbolSetHash,
        symbolStateHashesJson: prepared.symbolStateHashes,
        resolvedSymbolsJson: prepared.symbolOrder
      }
    });

    if (incrementalParent) {
      console.log(
        `[build-run:${buildRun.id}] reusing ${incrementalParent.seedRows} prefix rows from parent build ${incrementalParent.buildRunId}.`
      );
    }

    const securityMasterEntries = await prisma.securityMaster.findMany({
      where: {
        symbol: {
          in: prepared.symbolOrder
        }
      },
      select: {
        symbol: true,
        sector: true
      }
    });
    const sectorBySymbol = new Map(
      securityMasterEntries.map((entry) => [entry.symbol, entry.sector] as const)
    );

    const configuredArtifactStorageKind = resolveConfiguredArtifactStorageKind();

    let incrementalWriter: IncrementalBsmMatrixArtifactWriter | null = null;
    let scores: number[][];

    try {
      incrementalWriter = await openIncrementalBsmMatrixArtifactWriter({
        outputPath: artifactPaths.matrixPath,
        progressPath: artifactPaths.progressPath,
        symbols: prepared.symbolOrder,
        startRow: resumeState.startRow,
        seedFromPath: resumeState.startRow === 0 ? incrementalParent?.matrixPath : undefined,
        seedRows: resumeState.startRow === 0 ? incrementalParent?.seedRows ?? 0 : 0,
        metadata: {
          buildRunId: buildRun.id,
          symbolSetHash,
          asOfDate: buildRun.asOfDate,
          scoreMethod,
          windowDays,
          sourceDatasetMaxTradeDate,
          symbolCount: prepared.symbolOrder.length
        }
      });

      scores = await buildScoreMatrixIncrementally({
        symbolOrder: prepared.symbolOrder,
        rowBuilder: prepared.rowBuilder,
        writer: incrementalWriter
      });

      await incrementalWriter.finish();
    } catch (error) {
      incrementalWriter?.abort();
      throw error;
    }

    const { minScore, maxScore } = computeMatrixScoreRange(scores);
    const topPairs = computeTopPairs(scoreMethod, prepared.symbolOrder, scores);
    const structureSummary = computeBuildStructureSummary({
      scoreMethod,
      symbolOrder: prepared.symbolOrder,
      scores,
      sectorBySymbol
    });

    const preview: PreviewV1 = {
      format: PREVIEW_FORMAT,
      buildRunId: buildRun.id,
      datasetId: buildRun.datasetId,
      universeId: buildRun.universeId,
      asOfDate: buildRun.asOfDate,
      windowDays,
      scoreMethod,
      symbolOrder: prepared.symbolOrder,
      topPairs,
      minScore,
      maxScore,
      structureSummary
    };

    const previewByteSize = await writeJsonFile(artifactPaths.previewPath, preview);

    const matrixByteSize = await statFileByteSize(artifactPaths.matrixPath);
    const manifestCreatedAt = new Date().toISOString();

    const { byteSize: manifestByteSize } = await writeManifestJsonStable(
      artifactPaths.manifestPath,
      (currentManifestByteSize): ManifestV1 => ({
        format: MANIFEST_FORMAT,
        artifactBundleVersion: ARTIFACT_BUNDLE_VERSION,
        buildRunId: buildRun.id,
        datasetId: buildRun.datasetId,
        universeId: buildRun.universeId,
        asOfDate: buildRun.asOfDate,
        windowDays,
        scoreMethod,
        symbolCount: prepared.symbolOrder.length,
        symbolOrder: prepared.symbolOrder,
        files: {
          matrix: {
            filename: ARTIFACT_FILE_NAMES.matrix,
            mediaType: 'application/octet-stream',
            byteSize: matrixByteSize
          },
          preview: {
            filename: ARTIFACT_FILE_NAMES.preview,
            mediaType: 'application/json',
            byteSize: previewByteSize
          },
          manifest: {
            filename: ARTIFACT_FILE_NAMES.manifest,
            mediaType: 'application/json',
            byteSize: currentManifestByteSize
          }
        },
        stats: {
          minScore,
          maxScore,
          topPairCount: topPairs.length
        },
        createdAt: manifestCreatedAt
      })
    );

    let persistedStorageKind: ArtifactStorageKind = ArtifactStorageKind.local_fs;
    let persistedStorageBucket: string | null = null;
    let persistedStoragePrefix = artifactPaths.storagePrefix;

    if (configuredArtifactStorageKind === 's3') {
      const uploadedArtifact = await uploadLocalArtifactBundleToS3({
        buildRunId: buildRun.id,
        localPaths: artifactPaths
      });

      persistedStorageKind = ArtifactStorageKind.s3;
      persistedStorageBucket = uploadedArtifact.storageBucket;
      persistedStoragePrefix = uploadedArtifact.storagePrefix;
    }

    await prisma.$transaction(async (tx) => {
      await tx.artifact.upsert({
        where: {
          buildRunId: buildRun.id
        },
        update: {
          bundleVersion: ARTIFACT_BUNDLE_VERSION,
          storageKind: persistedStorageKind,
          storageBucket: persistedStorageBucket,
          storagePrefix: persistedStoragePrefix,
          matrixByteSize: BigInt(matrixByteSize),
          previewByteSize: BigInt(previewByteSize),
          manifestByteSize: BigInt(manifestByteSize),
          symbolCount: prepared.symbolOrder.length,
          minScore,
          maxScore
        },
        create: {
          buildRunId: buildRun.id,
          bundleVersion: ARTIFACT_BUNDLE_VERSION,
          storageKind: persistedStorageKind,
          storageBucket: persistedStorageBucket,
          storagePrefix: persistedStoragePrefix,
          matrixByteSize: BigInt(matrixByteSize),
          previewByteSize: BigInt(previewByteSize),
          manifestByteSize: BigInt(manifestByteSize),
          symbolCount: prepared.symbolOrder.length,
          minScore,
          maxScore
        }
      });

      await tx.buildRun.update({
        where: {
          id: buildRun.id
        },
        data: {
          status: 'succeeded',
          finishedAt: new Date(),
          errorMessage: null
        }
      });
    });

    if (persistedStorageKind === ArtifactStorageKind.s3) {
      await cleanupLocalArtifactBundle(buildRunId);
    } else {
      await clearIncrementalBsmBuildProgress(artifactPaths.progressPath).catch(() => {
        // best effort cleanup only
      });
    }

    // Update series progress AFTER the transaction commits so counts see committed data
    if (buildRun.seriesId) {
      await updateSeriesProgress(prisma, buildRun.seriesId);
    }
  } catch (error) {
    await cleanupLocalArtifactBundle(buildRunId).catch(() => {
      // best effort cleanup only
    });

    await prisma.buildRun
      .update({
        where: {
          id: buildRunId
        },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          errorMessage: toErrorMessage(error)
        }
      })
      .catch(() => {
        // best effort failure update only
      });

    console.error(`[build-run:${buildRunId}] failed`, error);

    // Update series progress on failure too
    const failedRun = await prisma.buildRun.findUnique({
      where: { id: buildRunId },
      select: { seriesId: true }
    });
    if (failedRun?.seriesId) {
      await updateSeriesProgress(prisma, failedRun.seriesId).catch(() => {});
    }
  } finally {
    queuedOrRunningBuildRunIds.delete(buildRunId);
  }
}

async function buildCorrelationArtifactData(args: {
  datasetId: string;
  symbolOrder: string[];
  asOfDate: string;
  windowDays: number;
  scoreMethod: BuildRunScoreMethod;
}): Promise<PreparedScoreBuild> {
  const preparedInputs = await prepareCorrelationInputs(args);

  if (preparedInputs.matrixReadySymbolOrder.length < MIN_BUILD_UNIVERSE_SIZE) {
    throw new Error(
      `Only ${preparedInputs.matrixReadySymbolOrder.length} symbols remain after filtering near-zero-variance return series.`
    );
  }

  const rowBuilder = createPairwiseScoreRowBuilder({
    symbolOrder: preparedInputs.matrixReadySymbolOrder,
    returnVectorsBySymbol: preparedInputs.returnVectorsBySymbol,
    windowDays: args.windowDays,
    scoreMethod: args.scoreMethod
  });

  return {
    symbolOrder: preparedInputs.matrixReadySymbolOrder,
    rowBuilder,
    symbolStateHashes: preparedInputs.matrixReadySymbolOrder.map((symbol) => {
      const returns = preparedInputs.returnVectorsBySymbol.get(symbol);

      if (!returns) {
        throw new Error(`Missing return vector for symbol "${symbol}" while hashing build inputs.`);
      }

      return computeReturnVectorHash(returns);
    })
  };
}

async function buildScoreMatrixIncrementally(args: {
  symbolOrder: string[];
  rowBuilder: PairwiseScoreRowBuilder;
  writer: IncrementalBsmMatrixArtifactWriter;
}): Promise<number[][]> {
  const scores = Array.from({ length: args.symbolOrder.length }, () =>
    Array<number>(args.symbolOrder.length).fill(0)
  );

  for (let rowIndex = 0; rowIndex < args.symbolOrder.length; rowIndex += 1) {
    const lowerRow = args.rowBuilder.buildLowerRow(rowIndex);

    for (let columnIndex = 0; columnIndex <= rowIndex; columnIndex += 1) {
      const score = lowerRow[columnIndex]!;
      scores[rowIndex]![columnIndex] = score;
      scores[columnIndex]![rowIndex] = score;
    }

    if (rowIndex >= args.writer.startRow) {
      await args.writer.appendLowerRow(rowIndex, lowerRow);
    }
  }

  return scores;
}

function computeSymbolSetHash(symbolOrder: string[]): string {
  return createHash('sha256').update(symbolOrder.join('\n')).digest('hex');
}

function computeReturnVectorHash(returnVector: Float64Array): string {
  return createHash('sha256')
    .update(Buffer.from(returnVector.buffer, returnVector.byteOffset, returnVector.byteLength))
    .digest('hex');
}

async function resolveIncrementalParentBuild(args: {
  buildRunId: string;
  datasetId: string;
  universeId: string;
  asOfDate: string;
  windowDays: BuildRunWindowDays;
  scoreMethod: BuildRunScoreMethod;
  symbolOrder: string[];
  symbolStateHashes: string[];
}): Promise<IncrementalParentBuild | null> {
  const candidates = await prisma.buildRun.findMany({
    where: {
      id: {
        not: args.buildRunId
      },
      datasetId: args.datasetId,
      universeId: args.universeId,
      asOfDate: {
        lte: args.asOfDate
      },
      windowDays: args.windowDays,
      scoreMethod: args.scoreMethod,
      status: 'succeeded',
      artifact: {
        isNot: null
      }
    },
    select: {
      id: true,
      resolvedSymbolsJson: true,
      symbolStateHashesJson: true,
      artifact: {
        select: {
          storageKind: true,
          storageBucket: true,
          storagePrefix: true,
          matrixByteSize: true
        }
      }
    },
    orderBy: [
      {
        asOfDate: 'desc'
      },
      {
        createdAt: 'desc'
      }
    ],
    take: 10
  });

  for (const candidate of candidates) {
    const parentSymbols = readStringArrayJson(candidate.resolvedSymbolsJson);
    const parentSymbolStateHashes = readStringArrayJson(candidate.symbolStateHashesJson);

    if (!parentSymbols || !parentSymbolStateHashes) {
      continue;
    }

    if (parentSymbols.length !== parentSymbolStateHashes.length) {
      continue;
    }

    const seedRows = computeReusablePrefixRowCount({
      currentSymbols: args.symbolOrder,
      currentSymbolStateHashes: args.symbolStateHashes,
      parentSymbols,
      parentSymbolStateHashes
    });

    if (seedRows <= 0 || !candidate.artifact) {
      continue;
    }

    const matrixPath = await ensureLocalMatrixArtifactPath({
      storageKind: candidate.artifact.storageKind,
      storageBucket: candidate.artifact.storageBucket,
      storagePrefix: candidate.artifact.storagePrefix,
      matrixByteSize: candidate.artifact.matrixByteSize
    });

    return {
      buildRunId: candidate.id,
      matrixPath,
      seedRows
    };
  }

  return null;
}

function computeReusablePrefixRowCount(args: {
  currentSymbols: string[];
  currentSymbolStateHashes: string[];
  parentSymbols: string[];
  parentSymbolStateHashes: string[];
}): number {
  const comparableLength = Math.min(args.currentSymbols.length, args.parentSymbols.length);

  for (let index = 0; index < comparableLength; index += 1) {
    if (args.currentSymbols[index] !== args.parentSymbols[index]) {
      return index;
    }

    if (args.currentSymbolStateHashes[index] !== args.parentSymbolStateHashes[index]) {
      return index;
    }
  }

  return comparableLength;
}

function readStringArrayJson(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    return null;
  }

  return value;
}

function computeMatrixScoreRange(scores: number[][]): { minScore: number; maxScore: number } {
  let minScore = Number.POSITIVE_INFINITY;
  let maxScore = Number.NEGATIVE_INFINITY;

  for (const row of scores) {
    for (const value of row) {
      if (value < minScore) {
        minScore = value;
      }

      if (value > maxScore) {
        maxScore = value;
      }
    }
  }

  if (!Number.isFinite(minScore) || !Number.isFinite(maxScore)) {
    throw new Error('Failed to compute score range for correlation matrix.');
  }

  return { minScore, maxScore };
}

function computeTopPairs(
  scoreMethod: BuildRunScoreMethod,
  symbolOrder: string[],
  scores: number[][]
): TopPairItem[] {
  const pairs: TopPairItem[] = [];

  for (let i = 0; i < symbolOrder.length; i += 1) {
    for (let j = i + 1; j < symbolOrder.length; j += 1) {
      pairs.push({
        left: symbolOrder[i]!,
        right: symbolOrder[j]!,
        score: scores[i]![j]!
      });

      pairs.sort((left, right) => compareTopPairItems(scoreMethod, left, right));
      if (pairs.length > TOP_PAIR_LIMIT) {
        pairs.pop();
      }
    }
  }

  return pairs;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 4000);
  }

  return 'Unknown build failure.';
}

async function updateSeriesProgress(
  db: { buildRun: { count: typeof prisma.buildRun.count }; buildSeries: { update: typeof prisma.buildSeries.update } },
  seriesId: string
): Promise<void> {
  const [completedCount, failedCount, totalCount] = await Promise.all([
    db.buildRun.count({ where: { seriesId, status: 'succeeded' } }),
    db.buildRun.count({ where: { seriesId, status: 'failed' } }),
    db.buildRun.count({ where: { seriesId } })
  ]);

  const allDone = completedCount + failedCount >= totalCount;

  let status: BuildSeriesStatus;
  if (!allDone) {
    status = 'running';
  } else if (failedCount === 0) {
    status = 'succeeded';
  } else if (completedCount === 0) {
    status = 'failed';
  } else {
    status = 'partially_failed';
  }

  await db.buildSeries.update({
    where: { id: seriesId },
    data: {
      completedRunCount: completedCount,
      failedRunCount: failedCount,
      status,
      finishedAt: allDone ? new Date() : null
    }
  });
}