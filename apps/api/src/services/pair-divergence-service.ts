import { prisma } from '../lib/prisma.js';
import { ServiceError } from '../lib/service-error.js';
import {
  DEFAULT_PAIR_DIVERGENCE_LIMIT,
  DEFAULT_PAIR_DIVERGENCE_MIN_CORR_DELTA_ABS,
  DEFAULT_PAIR_DIVERGENCE_MIN_LONG_CORR_ABS,
  DEFAULT_PAIR_DIVERGENCE_RECENT_WINDOW_DAYS,
  MAX_PAIR_DIVERGENCE_LIMIT,
  MAX_PAIR_DIVERGENCE_RECENT_WINDOW_DAYS,
  MIN_PAIR_DIVERGENCE_RECENT_WINDOW_DAYS,
  type BuildRunWindowDays,
  type PairDivergenceCandidate,
  type PairDivergenceQuerystring,
  type PairDivergenceResponse,
  type PreviewV1
} from '../contracts/build-runs.js';
import {
  buildAlignedPriceSeries,
  buildRowsBySymbol,
  computeCumulativeReturn,
  computeLogReturns,
  computeSpreadZScore,
  pearsonCorrelation,
  type PriceRow,
  selectAlignedWindowDates
} from './correlation-analytics.js';
import { readPreviewArtifact } from './local-artifact-store.js';

export async function getBuildRunPairDivergence(
  buildRunId: string,
  query: PairDivergenceQuerystring
): Promise<PairDivergenceResponse> {
  const buildRun = await prisma.buildRun.findUnique({
    where: {
      id: buildRunId
    },
    select: {
      id: true,
      datasetId: true,
      asOfDate: true,
      windowDays: true,
      status: true,
      artifact: {
        select: {
          storageKind: true,
          storagePrefix: true
        }
      }
    }
  });

  if (!buildRun) {
    throw new ServiceError(404, `Build run "${buildRunId}" was not found.`);
  }

  if (buildRun.status !== 'succeeded' || !buildRun.artifact) {
    throw new ServiceError(409, `Build run "${buildRunId}" is not ready for divergence analysis.`);
  }

  const recentWindowDays = query.recentWindowDays ?? DEFAULT_PAIR_DIVERGENCE_RECENT_WINDOW_DAYS;
  const limit = query.limit ?? DEFAULT_PAIR_DIVERGENCE_LIMIT;
  const minLongCorrAbs = query.minLongCorrAbs ?? DEFAULT_PAIR_DIVERGENCE_MIN_LONG_CORR_ABS;
  const minCorrDeltaAbs = query.minCorrDeltaAbs ?? DEFAULT_PAIR_DIVERGENCE_MIN_CORR_DELTA_ABS;

  if (
    !Number.isInteger(recentWindowDays) ||
    recentWindowDays < MIN_PAIR_DIVERGENCE_RECENT_WINDOW_DAYS ||
    recentWindowDays > MAX_PAIR_DIVERGENCE_RECENT_WINDOW_DAYS
  ) {
    throw new ServiceError(
      400,
      `Query parameter "recentWindowDays" must be an integer between ${MIN_PAIR_DIVERGENCE_RECENT_WINDOW_DAYS} and ${MAX_PAIR_DIVERGENCE_RECENT_WINDOW_DAYS}.`
    );
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAIR_DIVERGENCE_LIMIT) {
    throw new ServiceError(
      400,
      `Query parameter "limit" must be an integer between 1 and ${MAX_PAIR_DIVERGENCE_LIMIT}.`
    );
  }

  if (!Number.isFinite(minLongCorrAbs) || minLongCorrAbs < 0 || minLongCorrAbs > 1) {
    throw new ServiceError(400, 'Query parameter "minLongCorrAbs" must be between 0 and 1.');
  }

  if (!Number.isFinite(minCorrDeltaAbs) || minCorrDeltaAbs < 0 || minCorrDeltaAbs > 2) {
    throw new ServiceError(400, 'Query parameter "minCorrDeltaAbs" must be between 0 and 2.');
  }

  if (recentWindowDays >= buildRun.windowDays) {
    throw new ServiceError(
      400,
      `Query parameter "recentWindowDays" must be smaller than the build window ${buildRun.windowDays}.`
    );
  }

  const preview = await readPreviewArtifact(
    buildRun.artifact.storageKind,
    buildRun.artifact.storagePrefix
  );

  validatePreviewShape(preview);

  const symbolOrder = preview.symbolOrder;

  const [priceRows, securityMasterEntries] = await Promise.all([
    prisma.eodPrice.findMany({
      where: {
        datasetId: buildRun.datasetId,
        symbol: {
          in: symbolOrder
        },
        tradeDate: {
          lte: buildRun.asOfDate
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
    }),
    prisma.securityMaster.findMany({
      where: {
        symbol: {
          in: symbolOrder
        }
      },
      select: {
        symbol: true,
        sector: true
      }
    })
  ]);

  const rowsBySymbol = buildRowsBySymbol(priceRows as PriceRow[], symbolOrder);
  const recentDates = selectAlignedWindowDates(
    rowsBySymbol,
    symbolOrder,
    buildRun.asOfDate,
    recentWindowDays
  );
  const recentPriceSeriesBySymbol = buildAlignedPriceSeries(rowsBySymbol, symbolOrder, recentDates);

  const recentReturnSeriesBySymbol = new Map<string, number[]>();
  const recentCumulativeReturnBySymbol = new Map<string, number>();

  for (const symbol of symbolOrder) {
    const priceSeries = recentPriceSeriesBySymbol.get(symbol);
    if (!priceSeries) {
      throw new Error(`Recent price series is missing for symbol "${symbol}".`);
    }

    recentReturnSeriesBySymbol.set(symbol, computeLogReturns(priceSeries));
    recentCumulativeReturnBySymbol.set(symbol, computeCumulativeReturn(priceSeries));
  }

  const sectorBySymbol = new Map(
    securityMasterEntries.map((entry) => [entry.symbol, entry.sector] as const)
  );

  const candidates: PairDivergenceCandidate[] = [];

  for (let i = 0; i < symbolOrder.length; i += 1) {
    const left = symbolOrder[i]!;
    const leftRecentReturns = recentReturnSeriesBySymbol.get(left);
    const leftRecentPrices = recentPriceSeriesBySymbol.get(left);
    const leftRecentCumulativeReturn = recentCumulativeReturnBySymbol.get(left);

    if (!leftRecentReturns || !leftRecentPrices || leftRecentCumulativeReturn === undefined) {
      throw new Error(`Recent analytics inputs are missing for symbol "${left}".`);
    }

    for (let j = i + 1; j < symbolOrder.length; j += 1) {
      const right = symbolOrder[j]!;
      const longWindowCorr = preview.scores[i]?.[j];

      if (!Number.isFinite(longWindowCorr)) {
        throw new Error(
          `Encountered non-finite long-window score at [${i}, ${j}] in preview artifact.`
        );
      }

      if (Math.abs(longWindowCorr) < minLongCorrAbs) {
        continue;
      }

      const rightRecentReturns = recentReturnSeriesBySymbol.get(right);
      const rightRecentPrices = recentPriceSeriesBySymbol.get(right);
      const rightRecentCumulativeReturn = recentCumulativeReturnBySymbol.get(right);

      if (!rightRecentReturns || !rightRecentPrices || rightRecentCumulativeReturn === undefined) {
        throw new Error(`Recent analytics inputs are missing for symbol "${right}".`);
      }

      let recentCorr: number;

      try {
        recentCorr = pearsonCorrelation(leftRecentReturns, rightRecentReturns);
      } catch {
        continue;
      }

      const corrDelta = recentCorr - longWindowCorr;

      if (Math.abs(corrDelta) < minCorrDeltaAbs) {
        continue;
      }

      const recentRelativeReturnGap = leftRecentCumulativeReturn - rightRecentCumulativeReturn;
      const spreadZScore = computeSpreadZScore(leftRecentPrices, rightRecentPrices);
      const leftSector = sectorBySymbol.get(left) ?? null;
      const rightSector = sectorBySymbol.get(right) ?? null;

      candidates.push({
        left,
        right,
        leftSector,
        rightSector,
        sameSector: leftSector !== null && rightSector !== null && leftSector === rightSector,
        longWindowCorr,
        recentCorr,
        corrDelta,
        recentRelativeReturnGap,
        spreadZScore
      });
    }
  }

  candidates.sort((left, right) => {
    const deltaDiff = Math.abs(right.corrDelta) - Math.abs(left.corrDelta);
    if (deltaDiff !== 0) {
      return deltaDiff;
    }

    const gapDiff =
      Math.abs(right.recentRelativeReturnGap) - Math.abs(left.recentRelativeReturnGap);
    if (gapDiff !== 0) {
      return gapDiff;
    }

    const spreadDiff = Math.abs(right.spreadZScore ?? 0) - Math.abs(left.spreadZScore ?? 0);
    if (spreadDiff !== 0) {
      return spreadDiff;
    }

    const leftCompare = left.left.localeCompare(right.left);
    if (leftCompare !== 0) {
      return leftCompare;
    }

    return left.right.localeCompare(right.right);
  });

  return {
    buildRunId: buildRun.id,
    asOfDate: buildRun.asOfDate,
    symbolCount: symbolOrder.length,
    longWindowDays: buildRun.windowDays as BuildRunWindowDays,
    recentWindowDays,
    minLongCorrAbs,
    minCorrDeltaAbs,
    limit,
    candidateCount: candidates.length,
    candidates: candidates.slice(0, limit)
  };
}

function validatePreviewShape(preview: PreviewV1): void {
  const n = preview.symbolOrder.length;

  if (preview.scores.length !== n) {
    throw new Error(
      `Preview score matrix row count ${preview.scores.length} does not match symbol count ${n}.`
    );
  }

  for (let i = 0; i < preview.scores.length; i += 1) {
    const row = preview.scores[i];
    if (row.length !== n) {
      throw new Error(`Preview score matrix row ${i} has length ${row.length}, expected ${n}.`);
    }
  }
}