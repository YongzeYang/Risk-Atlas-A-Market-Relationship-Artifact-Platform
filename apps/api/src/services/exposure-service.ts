import { prisma } from '../lib/prisma.js';
import { ServiceError } from '../lib/service-error.js';
import {
  DEFAULT_NEIGHBOR_K,
  EXPOSURE_STRENGTH_BANDS,
  MAX_NEIGHBOR_K,
  type ExposureBandSummary,
  type ExposureNeighborEntry,
  type ExposureQuerystring,
  type ExposureResponse,
  type ExposureSectorSummary,
  type ExposureStrengthBand
} from '../contracts/build-runs.js';
import {
  loadSucceededBuildRunArtifactContext,
  normalizeArtifactSymbol,
  requireArtifactSymbolIndex
} from './build-run-artifact-context.js';
import { queryBsmRowTopk } from './bsm-reader.js';

type SecuritySnapshot = {
  sector: string | null;
  securityType: string | null;
};

export async function getBuildRunExposure(
  buildRunId: string,
  query: ExposureQuerystring
): Promise<ExposureResponse> {
  const context = await loadSucceededBuildRunArtifactContext(
    buildRunId,
    `Build run "${buildRunId}" is not ready for exposure analysis.`
  );

  const symbol = normalizeArtifactSymbol(query.symbol);
  const anchorIndex = requireArtifactSymbolIndex(context, symbol);
  const k = query.k ?? DEFAULT_NEIGHBOR_K;

  if (!Number.isInteger(k) || k < 1 || k > MAX_NEIGHBOR_K) {
    throw new ServiceError(
      400,
      `Query parameter "k" must be an integer between 1 and ${MAX_NEIGHBOR_K}.`
    );
  }

  const rowTopk = await queryBsmRowTopk(context.matrixPath, anchorIndex, k + 1);
  const rawNeighbors = rowTopk
    .map((entry) => ({
      symbol: context.preview.symbolOrder[entry.index] ?? '',
      score: entry.score
    }))
    .filter((entry) => entry.symbol.length > 0 && entry.symbol !== symbol)
    .sort((left, right) => {
      const scoreDiff = right.score - left.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return left.symbol.localeCompare(right.symbol);
    })
    .slice(0, k);

  const securityRows = await prisma.securityMaster.findMany({
    where: {
      symbol: {
        in: [symbol, ...rawNeighbors.map((entry) => entry.symbol)]
      }
    },
    select: {
      symbol: true,
      sector: true,
      securityType: true
    }
  });

  const securityBySymbol = new Map(
    securityRows.map((entry) => [
      entry.symbol,
      {
        sector: entry.sector,
        securityType: entry.securityType
      } satisfies SecuritySnapshot
    ])
  );

  const anchorSector = securityBySymbol.get(symbol)?.sector ?? null;
  const weights = normalizeExposureWeights(rawNeighbors.map((entry) => entry.score));

  const neighbors: ExposureNeighborEntry[] = rawNeighbors.map((entry) => {
    const snapshot = securityBySymbol.get(entry.symbol);
    const sector = snapshot?.sector ?? null;

    return {
      symbol: entry.symbol,
      score: entry.score,
      sector,
      securityType: snapshot?.securityType ?? null,
      sameSector: anchorSector !== null && sector !== null && anchorSector === sector,
      strengthBand: classifyExposureStrength(entry.score)
    };
  });

  const sectorStats = new Map<
    string,
    { sector: string | null; count: number; totalWeight: number; scoreSum: number }
  >();

  neighbors.forEach((entry, index) => {
    const key = entry.sector ?? '__null__';
    const current = sectorStats.get(key) ?? {
      sector: entry.sector,
      count: 0,
      totalWeight: 0,
      scoreSum: 0
    };

    current.count += 1;
    current.totalWeight += weights[index] ?? 0;
    current.scoreSum += entry.score;
    sectorStats.set(key, current);
  });

  const sectors: ExposureSectorSummary[] = [...sectorStats.values()]
    .map((entry) => ({
      sector: entry.sector,
      count: entry.count,
      weightShare: entry.totalWeight,
      averageScore: entry.count > 0 ? entry.scoreSum / entry.count : 0
    }))
    .sort((left, right) => {
      const weightDiff = right.weightShare - left.weightShare;
      if (weightDiff !== 0) {
        return weightDiff;
      }

      const leftSector = left.sector ?? 'zzzz';
      const rightSector = right.sector ?? 'zzzz';
      return leftSector.localeCompare(rightSector);
    });

  const bands: ExposureBandSummary[] = EXPOSURE_STRENGTH_BANDS.map((band) => ({
    band,
    count: neighbors.filter((entry) => entry.strengthBand === band).length
  }));

  const concentrationIndex = weights.reduce((sum, weight) => sum + weight * weight, 0);
  const sameSectorWeightShare = neighbors.reduce(
    (sum, entry, index) => sum + (entry.sameSector ? weights[index] ?? 0 : 0),
    0
  );

  return {
    buildRunId: context.buildRunId,
    asOfDate: context.asOfDate,
    symbol,
    anchorSector,
    k,
    neighborCount: neighbors.length,
    averageNeighborScore:
      neighbors.length > 0
        ? neighbors.reduce((sum, entry) => sum + entry.score, 0) / neighbors.length
        : 0,
    concentrationIndex,
    effectiveNeighborCount: concentrationIndex > 0 ? 1 / concentrationIndex : 0,
    sameSectorCount: neighbors.filter((entry) => entry.sameSector).length,
    sameSectorWeightShare,
    sectors,
    bands,
    neighbors
  };
}

function normalizeExposureWeights(scores: number[]): number[] {
  const positiveWeights = scores.map((score) => Math.max(score, 0));
  const positiveTotal = positiveWeights.reduce((sum, value) => sum + value, 0);

  if (positiveTotal > 0) {
    return positiveWeights.map((value) => value / positiveTotal);
  }

  const absoluteWeights = scores.map((score) => Math.abs(score));
  const absoluteTotal = absoluteWeights.reduce((sum, value) => sum + value, 0);

  if (absoluteTotal === 0) {
    return scores.map(() => 0);
  }

  return absoluteWeights.map((value) => value / absoluteTotal);
}

function classifyExposureStrength(score: number): ExposureStrengthBand {
  if (score >= 0.8) {
    return 'very_high';
  }

  if (score >= 0.6) {
    return 'high';
  }

  if (score >= 0.4) {
    return 'moderate';
  }

  return 'low';
}