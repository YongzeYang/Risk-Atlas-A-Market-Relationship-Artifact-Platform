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
import { writeBsmMatrixArtifact } from './bsm-writer.js';
import {
  cleanupLocalArtifactBundle,
  prepareLocalArtifactBundle,
  statFileByteSize,
  writeJsonFile,
  writeManifestJsonStable
} from './local-artifact-store.js';
import {
  buildScoreMatrix,
} from './correlation-analytics.js';
import { prepareCorrelationInputs } from './correlation-preparation-service.js';
import { compareTopPairItems } from './score-method-spec.js';
import { computeBuildStructureSummary } from './structure-service.js';
import { resolveUniverseSymbols } from './universe-resolver.js';

type PreparedScoreBuild = {
  symbolOrder: string[];
  scores: number[][];
  topPairs: TopPairItem[];
  minScore: number;
  maxScore: number;
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

async function runBuildInternal(buildRunId: string): Promise<void> {
  try {
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

    // Store the final symbol snapshot after filtering out unusable series.
    await prisma.buildRun.update({
      where: { id: buildRunId },
      data: { resolvedSymbolsJson: prepared.symbolOrder }
    });

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
    const structureSummary = computeBuildStructureSummary({
      scoreMethod,
      symbolOrder: prepared.symbolOrder,
      scores: prepared.scores,
      sectorBySymbol
    });

    const artifactPaths = await prepareLocalArtifactBundle(buildRunId);

    const preview: PreviewV1 = {
      format: PREVIEW_FORMAT,
      buildRunId: buildRun.id,
      datasetId: buildRun.datasetId,
      universeId: buildRun.universeId,
      asOfDate: buildRun.asOfDate,
      windowDays,
      scoreMethod,
      symbolOrder: prepared.symbolOrder,
      topPairs: prepared.topPairs,
      minScore: prepared.minScore,
      maxScore: prepared.maxScore,
      structureSummary
    };

    const previewByteSize = await writeJsonFile(artifactPaths.previewPath, preview);

    await writeBsmMatrixArtifact({
      outputPath: artifactPaths.matrixPath,
      symbols: prepared.symbolOrder,
      scores: prepared.scores
    });

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
          minScore: prepared.minScore,
          maxScore: prepared.maxScore,
          topPairCount: prepared.topPairs.length
        },
        createdAt: manifestCreatedAt
      })
    );

    await prisma.$transaction(async (tx) => {
      await tx.artifact.upsert({
        where: {
          buildRunId: buildRun.id
        },
        update: {
          bundleVersion: ARTIFACT_BUNDLE_VERSION,
          storageKind: ArtifactStorageKind.local_fs,
          storageBucket: null,
          storagePrefix: artifactPaths.storagePrefix,
          matrixByteSize: BigInt(matrixByteSize),
          previewByteSize: BigInt(previewByteSize),
          manifestByteSize: BigInt(manifestByteSize),
          symbolCount: prepared.symbolOrder.length,
          minScore: prepared.minScore,
          maxScore: prepared.maxScore
        },
        create: {
          buildRunId: buildRun.id,
          bundleVersion: ARTIFACT_BUNDLE_VERSION,
          storageKind: ArtifactStorageKind.local_fs,
          storageBucket: null,
          storagePrefix: artifactPaths.storagePrefix,
          matrixByteSize: BigInt(matrixByteSize),
          previewByteSize: BigInt(previewByteSize),
          manifestByteSize: BigInt(manifestByteSize),
          symbolCount: prepared.symbolOrder.length,
          minScore: prepared.minScore,
          maxScore: prepared.maxScore
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

  const scores = buildScoreMatrix({
    symbolOrder: preparedInputs.matrixReadySymbolOrder,
    returnVectorsBySymbol: preparedInputs.returnVectorsBySymbol,
    windowDays: args.windowDays,
    scoreMethod: args.scoreMethod
  });
  const { minScore, maxScore } = computeMatrixScoreRange(scores);
  const topPairs = computeTopPairs(
    args.scoreMethod,
    preparedInputs.matrixReadySymbolOrder,
    scores
  );

  return {
    symbolOrder: preparedInputs.matrixReadySymbolOrder,
    scores,
    topPairs,
    minScore,
    maxScore
  };
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