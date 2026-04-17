import { ArtifactStorageKind } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { parseUniverseSymbolsJson } from '../lib/universe-symbols.js';
import {
  ARTIFACT_BUNDLE_VERSION,
  ARTIFACT_FILE_NAMES,
  ISO_DATE_PATTERN_SOURCE,
  MANIFEST_FORMAT,
  PREVIEW_FORMAT,
  TOP_PAIR_LIMIT,
  isBuildRunWindowDays,
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

type PriceRow = {
  symbol: string;
  tradeDate: string;
  adjClose: number;
};

type PreparedCorrelationBuild = {
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

    if (buildRun.scoreMethod !== 'pearson_corr') {
      throw new Error(
        `Build run "${buildRunId}" has unsupported scoreMethod "${buildRun.scoreMethod}".`
      );
    }

    const windowDays: BuildRunWindowDays = buildRun.windowDays;
    const symbolOrder = parseUniverseSymbolsJson(buildRun.universe.symbolsJson);
    const prepared = await buildCorrelationArtifactData({
      datasetId: buildRun.datasetId,
      symbolOrder,
      asOfDate: buildRun.asOfDate,
      windowDays
    });

    const artifactPaths = await prepareLocalArtifactBundle(buildRunId);

    const preview: PreviewV1 = {
      format: PREVIEW_FORMAT,
      buildRunId: buildRun.id,
      datasetId: buildRun.datasetId,
      universeId: buildRun.universeId,
      asOfDate: buildRun.asOfDate,
      windowDays,
      scoreMethod: 'pearson_corr',
      symbolOrder: prepared.symbolOrder,
      scores: prepared.scores,
      topPairs: prepared.topPairs,
      minScore: prepared.minScore,
      maxScore: prepared.maxScore
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
        scoreMethod: 'pearson_corr',
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
  } finally {
    queuedOrRunningBuildRunIds.delete(buildRunId);
  }
}

async function buildCorrelationArtifactData(args: {
  datasetId: string;
  symbolOrder: string[];
  asOfDate: string;
  windowDays: number;
}): Promise<PreparedCorrelationBuild> {
  const priceRows = await prisma.eodPrice.findMany({
    where: {
      datasetId: args.datasetId,
      symbol: {
        in: args.symbolOrder
      },
      tradeDate: {
        lte: args.asOfDate
      }
    },
    orderBy: [
      {
        tradeDate: 'asc'
      }
    ],
    select: {
      symbol: true,
      tradeDate: true,
      adjClose: true
    }
  });

  const rowsBySymbol = buildRowsBySymbol(priceRows, args.symbolOrder);
  const selectedDates = selectAlignedWindowDates(
    rowsBySymbol,
    args.symbolOrder,
    args.asOfDate,
    args.windowDays
  );

  const returnSeriesBySymbol = new Map<string, number[]>();

  for (const symbol of args.symbolOrder) {
    const priceMap = rowsBySymbol.get(symbol);
    if (!priceMap) {
      throw new Error(`Missing price series for symbol "${symbol}".`);
    }

    const alignedPrices = selectedDates.map((tradeDate) => {
      const price = priceMap.get(tradeDate);

      if (price === undefined) {
        throw new Error(`Missing aligned price for symbol "${symbol}" on ${tradeDate}.`);
      }

      if (!Number.isFinite(price) || price <= 0) {
        throw new Error(`Invalid adjusted close for symbol "${symbol}" on ${tradeDate}.`);
      }

      return price;
    });

    returnSeriesBySymbol.set(symbol, computeLogReturns(alignedPrices));
  }

  const scores = buildCorrelationMatrix(args.symbolOrder, returnSeriesBySymbol);
  const { minScore, maxScore } = computeMatrixScoreRange(scores);
  const topPairs = computeTopPairs(args.symbolOrder, scores);

  return {
    symbolOrder: args.symbolOrder,
    scores,
    topPairs,
    minScore,
    maxScore
  };
}

function buildRowsBySymbol(
  rows: PriceRow[],
  symbolOrder: string[]
): Map<string, Map<string, number>> {
  const rowsBySymbol = new Map<string, Map<string, number>>();

  for (const symbol of symbolOrder) {
    rowsBySymbol.set(symbol, new Map<string, number>());
  }

  for (const row of rows) {
    const priceMap = rowsBySymbol.get(row.symbol);
    if (!priceMap) {
      continue;
    }

    priceMap.set(row.tradeDate, row.adjClose);
  }

  return rowsBySymbol;
}

function selectAlignedWindowDates(
  rowsBySymbol: Map<string, Map<string, number>>,
  symbolOrder: string[],
  asOfDate: string,
  windowDays: number
): string[] {
  const expectedPriceCount = windowDays + 1;

  const allDateLists = symbolOrder.map((symbol) => {
    const priceMap = rowsBySymbol.get(symbol);

    if (!priceMap) {
      throw new Error(`Price map missing for symbol "${symbol}".`);
    }

    const dates = [...priceMap.keys()].filter((tradeDate) => tradeDate <= asOfDate).sort();

    if (dates.length < expectedPriceCount) {
      throw new Error(
        `Symbol "${symbol}" has only ${dates.length} price rows up to ${asOfDate}, ` +
          `but ${expectedPriceCount} are required for windowDays=${windowDays}.`
      );
    }

    return dates;
  });

  const commonDates = [...allDateLists[0]!];
  const otherDateSets = allDateLists.slice(1).map((dates) => new Set(dates));

  const alignedCommonDates = commonDates.filter((tradeDate) =>
    otherDateSets.every((dateSet) => dateSet.has(tradeDate))
  );

  if (alignedCommonDates.length < expectedPriceCount) {
    throw new Error(
      `Only ${alignedCommonDates.length} aligned trading dates are available across the selected universe, ` +
        `but ${expectedPriceCount} are required.`
    );
  }

  const selectedDates = alignedCommonDates.slice(-expectedPriceCount);

  if (selectedDates[selectedDates.length - 1] !== asOfDate) {
    throw new Error(
      `Selected asOfDate "${asOfDate}" is not present as the final aligned trading date across all symbols.`
    );
  }

  return selectedDates;
}

function computeLogReturns(prices: number[]): number[] {
  if (prices.length < 2) {
    throw new Error('At least two prices are required to compute log returns.');
  }

  const returns: number[] = [];

  for (let i = 1; i < prices.length; i += 1) {
    const previous = prices[i - 1]!;
    const current = prices[i]!;

    if (previous <= 0 || current <= 0) {
      throw new Error('Adjusted close prices must be strictly positive.');
    }

    returns.push(Math.log(current / previous));
  }

  return returns;
}

function buildCorrelationMatrix(
  symbolOrder: string[],
  returnSeriesBySymbol: Map<string, number[]>
): number[][] {
  const n = symbolOrder.length;
  const scores = Array.from({ length: n }, () => Array<number>(n).fill(0));

  for (let i = 0; i < n; i += 1) {
    scores[i]![i] = 1;
  }

  for (let i = 0; i < n; i += 1) {
    const leftSymbol = symbolOrder[i]!;
    const leftReturns = returnSeriesBySymbol.get(leftSymbol);

    if (!leftReturns) {
      throw new Error(`Missing return series for symbol "${leftSymbol}".`);
    }

    for (let j = i + 1; j < n; j += 1) {
      const rightSymbol = symbolOrder[j]!;
      const rightReturns = returnSeriesBySymbol.get(rightSymbol);

      if (!rightReturns) {
        throw new Error(`Missing return series for symbol "${rightSymbol}".`);
      }

      const score = pearsonCorrelation(leftReturns, rightReturns);
      scores[i]![j] = score;
      scores[j]![i] = score;
    }
  }

  return scores;
}

function pearsonCorrelation(left: number[], right: number[]): number {
  if (left.length !== right.length) {
    throw new Error('Return series length mismatch while computing Pearson correlation.');
  }

  if (left.length === 0) {
    throw new Error('Cannot compute Pearson correlation for an empty return series.');
  }

  const meanLeft = mean(left);
  const meanRight = mean(right);

  let covariance = 0;
  let varianceLeft = 0;
  let varianceRight = 0;

  for (let i = 0; i < left.length; i += 1) {
    const centeredLeft = left[i]! - meanLeft;
    const centeredRight = right[i]! - meanRight;

    covariance += centeredLeft * centeredRight;
    varianceLeft += centeredLeft * centeredLeft;
    varianceRight += centeredRight * centeredRight;
  }

  if (varianceLeft <= 1e-20 || varianceRight <= 1e-20) {
    throw new Error('Encountered a near-zero-variance return series.');
  }

  const raw = covariance / Math.sqrt(varianceLeft * varianceRight);
  return clamp(raw, -1, 1);
}

function mean(values: number[]): number {
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

function computeTopPairs(symbolOrder: string[], scores: number[][]): TopPairItem[] {
  const pairs: TopPairItem[] = [];

  for (let i = 0; i < symbolOrder.length; i += 1) {
    for (let j = i + 1; j < symbolOrder.length; j += 1) {
      pairs.push({
        left: symbolOrder[i]!,
        right: symbolOrder[j]!,
        score: scores[i]![j]!
      });
    }
  }

  pairs.sort((a, b) => {
    const absDiff = Math.abs(b.score) - Math.abs(a.score);
    if (absDiff !== 0) {
      return absDiff;
    }

    const leftCompare = a.left.localeCompare(b.left);
    if (leftCompare !== 0) {
      return leftCompare;
    }

    return a.right.localeCompare(b.right);
  });

  return pairs.slice(0, TOP_PAIR_LIMIT);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 4000);
  }

  return 'Unknown build failure.';
}