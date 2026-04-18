import { prisma } from '../lib/prisma.js';
import { ServiceError } from '../lib/service-error.js';
import {
  DEFAULT_STRUCTURE_HEATMAP_SIZE,
  MAX_STRUCTURE_HEATMAP_SIZE,
  MIN_STRUCTURE_HEATMAP_SIZE,
  type BuildRunStructureSummary,
  type CompareBuildStructuresResponse,
  type StructureClusterMatch,
  type StructureClusterSummary,
  type StructureMovedSymbol,
  type StructureQuerystring,
  type StructureResponse
} from '../contracts/build-runs.js';
import {
  loadSucceededBuildRunArtifactContext,
  requireArtifactSymbolIndex
} from './build-run-artifact-context.js';
import { queryBsmSubmatrix } from './bsm-reader.js';

type StructureCandidate = {
  indices: number[];
};

type StructureBuildContext = {
  symbolOrder: string[];
  scores: number[][];
  sectorBySymbol: Map<string, string | null>;
};

type StructureClusterCandidate = {
  indices: number[];
  symbols: string[];
  dominantSector: string | null;
  averageInternalScore: number | null;
  sectors: { sector: string | null; count: number }[];
};

const STRUCTURE_THRESHOLDS = [0.65, 0.55, 0.45, 0.35] as const;

export async function getBuildRunStructure(
  buildRunId: string,
  query: StructureQuerystring
): Promise<StructureResponse> {
  const context = await loadSucceededBuildRunArtifactContext(
    buildRunId,
    `Build run "${buildRunId}" is not ready for structure analysis.`
  );

  const heatmapSize = query.heatmapSize ?? DEFAULT_STRUCTURE_HEATMAP_SIZE;

  if (
    !Number.isInteger(heatmapSize) ||
    heatmapSize < MIN_STRUCTURE_HEATMAP_SIZE ||
    heatmapSize > MAX_STRUCTURE_HEATMAP_SIZE
  ) {
    throw new ServiceError(
      400,
      `Query parameter "heatmapSize" must be an integer between ${MIN_STRUCTURE_HEATMAP_SIZE} and ${MAX_STRUCTURE_HEATMAP_SIZE}.`
    );
  }

  const summary = await resolveStructureSummary(buildRunId);
  const heatmapSymbols = summary.orderedSymbols.slice(
    0,
    Math.min(heatmapSize, summary.orderedSymbols.length)
  );
  const heatmapIndices = heatmapSymbols.map((symbol) => requireArtifactSymbolIndex(context, symbol));
  const heatmapScores =
    heatmapIndices.length > 0
      ? (await queryBsmSubmatrix(context.matrixPath, heatmapIndices)).scores
      : [];

  return {
    buildRunId: context.buildRunId,
    asOfDate: context.asOfDate,
    symbolCount: context.preview.symbolOrder.length,
    clusterThreshold: summary.clusterThreshold,
    clusterCount: summary.clusterCount,
    orderedSymbols: summary.orderedSymbols,
    heatmapSymbols,
    heatmapScores,
    clusters: summary.clusters
  };
}

export async function compareBuildStructures(
  leftId: string,
  rightId: string
): Promise<CompareBuildStructuresResponse> {
  const [leftContext, rightContext, leftSummary, rightSummary] = await Promise.all([
    loadSucceededBuildRunArtifactContext(
      leftId,
      `Build run "${leftId}" is not ready for structure comparison.`
    ),
    loadSucceededBuildRunArtifactContext(
      rightId,
      `Build run "${rightId}" is not ready for structure comparison.`
    ),
    resolveStructureSummary(leftId),
    resolveStructureSummary(rightId)
  ]);

  const rightSymbolSet = new Set(rightSummary.orderedSymbols);
  const commonSymbols = leftSummary.orderedSymbols.filter((symbol) => rightSymbolSet.has(symbol));

  if (commonSymbols.length < 2) {
    throw new ServiceError(400, 'Fewer than 2 common symbols between build structures.');
  }

  const leftClusterBySymbol = buildClusterLookup(leftSummary);
  const rightClusterBySymbol = buildClusterLookup(rightSummary);

  const overlapByPair = new Map<string, number>();
  for (const symbol of commonSymbols) {
    const leftCluster = leftClusterBySymbol.get(symbol);
    const rightCluster = rightClusterBySymbol.get(symbol);

    if (!leftCluster || !rightCluster) {
      continue;
    }

    const key = `${leftCluster.id}:${rightCluster.id}`;
    overlapByPair.set(key, (overlapByPair.get(key) ?? 0) + 1);
  }

  const sortedMatches = [...overlapByPair.entries()]
    .map(([key, overlapCount]) => {
      const [leftClusterId, rightClusterId] = key.split(':').map(Number);
      return {
        leftClusterId,
        rightClusterId,
        overlapCount
      } satisfies StructureClusterMatch;
    })
    .sort((left, right) => {
      const overlapDiff = right.overlapCount - left.overlapCount;
      if (overlapDiff !== 0) {
        return overlapDiff;
      }

      const leftIdDiff = left.leftClusterId - right.leftClusterId;
      if (leftIdDiff !== 0) {
        return leftIdDiff;
      }

      return left.rightClusterId - right.rightClusterId;
    });

  const matchedLeftClusterIds = new Set<number>();
  const matchedRightClusterIds = new Set<number>();
  const matchedLeftByRightCluster = new Map<number, number>();
  const clusterMatches: StructureClusterMatch[] = [];

  for (const match of sortedMatches) {
    if (
      matchedLeftClusterIds.has(match.leftClusterId) ||
      matchedRightClusterIds.has(match.rightClusterId)
    ) {
      continue;
    }

    clusterMatches.push(match);
    matchedLeftClusterIds.add(match.leftClusterId);
    matchedRightClusterIds.add(match.rightClusterId);
    matchedLeftByRightCluster.set(match.rightClusterId, match.leftClusterId);
  }

  const movedSymbols: StructureMovedSymbol[] = [];
  let stableSymbolCount = 0;

  for (const symbol of commonSymbols) {
    const leftCluster = leftClusterBySymbol.get(symbol);
    const rightCluster = rightClusterBySymbol.get(symbol);

    if (!leftCluster || !rightCluster) {
      continue;
    }

    if (matchedLeftByRightCluster.get(rightCluster.id) === leftCluster.id) {
      stableSymbolCount += 1;
      continue;
    }

    movedSymbols.push({
      symbol,
      leftClusterId: leftCluster.id,
      rightClusterId: rightCluster.id,
      leftClusterSize: leftCluster.size,
      rightClusterSize: rightCluster.size,
      leftDominantSector: leftCluster.dominantSector,
      rightDominantSector: rightCluster.dominantSector
    });
  }

  movedSymbols.sort((left, right) => {
    const sizeDiff =
      Math.abs(right.leftClusterSize - right.rightClusterSize) -
      Math.abs(left.leftClusterSize - left.rightClusterSize);
    if (sizeDiff !== 0) {
      return sizeDiff;
    }

    return left.symbol.localeCompare(right.symbol);
  });

  return {
    left: {
      id: leftContext.buildRunId,
      asOfDate: leftContext.asOfDate,
      symbolCount: leftSummary.orderedSymbols.length,
      clusterCount: leftSummary.clusterCount
    },
    right: {
      id: rightContext.buildRunId,
      asOfDate: rightContext.asOfDate,
      symbolCount: rightSummary.orderedSymbols.length,
      clusterCount: rightSummary.clusterCount
    },
    commonSymbolCount: commonSymbols.length,
    stableSymbolCount,
    changedSymbolCount: movedSymbols.length,
    clusterMatches,
    movedSymbols: movedSymbols.slice(0, 100)
  };
}

export async function resolveStructureSummary(
  buildRunId: string
): Promise<BuildRunStructureSummary> {
  const context = await loadSucceededBuildRunArtifactContext(
    buildRunId,
    `Build run "${buildRunId}" is not ready for structure analysis.`
  );

  if (context.preview.structureSummary) {
    return context.preview.structureSummary;
  }

  if (!Array.isArray(context.preview.scores) || context.preview.scores.length === 0) {
    throw new Error(
      `Build run "${buildRunId}" does not have persisted structureSummary and preview scores are unavailable.`
    );
  }

  const securityRows = await prisma.securityMaster.findMany({
    where: {
      symbol: {
        in: context.preview.symbolOrder
      }
    },
    select: {
      symbol: true,
      sector: true
    }
  });

  const sectorBySymbol = new Map(
    securityRows.map((entry) => [entry.symbol, entry.sector] as const)
  );

  return computeBuildStructureSummary({
    symbolOrder: context.preview.symbolOrder,
    scores: context.preview.scores,
    sectorBySymbol
  });
}

export function computeBuildStructureSummary(
  context: StructureBuildContext
): BuildRunStructureSummary {
  const chosen = chooseStructureComponents(context.scores);

  const clusterCandidates = chosen.components.map((component) =>
    buildStructureClusterCandidate(component, context)
  );

  clusterCandidates.sort((left, right) => {
    const sizeDiff = right.indices.length - left.indices.length;
    if (sizeDiff !== 0) {
      return sizeDiff;
    }

    const leftAverage = left.averageInternalScore ?? Number.NEGATIVE_INFINITY;
    const rightAverage = right.averageInternalScore ?? Number.NEGATIVE_INFINITY;
    const averageDiff = rightAverage - leftAverage;
    if (averageDiff !== 0) {
      return averageDiff;
    }

    const leftSector = left.dominantSector ?? 'zzzz';
    const rightSector = right.dominantSector ?? 'zzzz';
    return leftSector.localeCompare(rightSector);
  });

  const clusters: StructureClusterSummary[] = clusterCandidates.map((candidate, index) => ({
    id: index + 1,
    size: candidate.indices.length,
    dominantSector: candidate.dominantSector,
    averageInternalScore: candidate.averageInternalScore,
    symbols: candidate.symbols,
    sectors: candidate.sectors
  }));

  return {
    clusterThreshold: chosen.threshold,
    orderedSymbols: clusters.flatMap((cluster) => cluster.symbols),
    clusterCount: clusters.length,
    clusters
  };
}

function chooseStructureComponents(scores: number[][]): {
  threshold: number;
  components: StructureCandidate[];
} {
  const symbolCount = scores.length;
  let fallback: { threshold: number; components: StructureCandidate[] } | null = null;

  for (const threshold of STRUCTURE_THRESHOLDS) {
    const components = buildConnectedComponents(scores, threshold);
    const nonSingletonCount = components.reduce(
      (sum, component) => sum + (component.indices.length > 1 ? component.indices.length : 0),
      0
    );

    fallback = { threshold, components };

    if (
      nonSingletonCount >= Math.max(4, Math.floor(symbolCount * 0.2)) ||
      components.length <= Math.max(2, Math.ceil(symbolCount / 6))
    ) {
      return { threshold, components };
    }
  }

  return (
    fallback ?? {
      threshold: STRUCTURE_THRESHOLDS[STRUCTURE_THRESHOLDS.length - 1],
      components: buildConnectedComponents(
        scores,
        STRUCTURE_THRESHOLDS[STRUCTURE_THRESHOLDS.length - 1]
      )
    }
  );
}

function buildConnectedComponents(scores: number[][], threshold: number): StructureCandidate[] {
  const visited = new Set<number>();
  const components: StructureCandidate[] = [];

  for (let start = 0; start < scores.length; start += 1) {
    if (visited.has(start)) {
      continue;
    }

    const stack = [start];
    const indices: number[] = [];
    visited.add(start);

    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) {
        continue;
      }

      indices.push(current);

      for (let next = 0; next < scores.length; next += 1) {
        if (visited.has(next) || next === current) {
          continue;
        }

        if ((scores[current]?.[next] ?? -1) >= threshold) {
          visited.add(next);
          stack.push(next);
        }
      }
    }

    components.push({
      indices: indices.sort((left, right) => left - right)
    });
  }

  return components;
}

function buildStructureClusterCandidate(
  component: StructureCandidate,
  context: StructureBuildContext
): StructureClusterCandidate {
  const sortedIndices = [...component.indices].sort((left, right) => {
    const leftStrength = averageInternalStrength(left, component.indices, context.scores);
    const rightStrength = averageInternalStrength(right, component.indices, context.scores);
    const strengthDiff = rightStrength - leftStrength;
    if (strengthDiff !== 0) {
      return strengthDiff;
    }

    return context.symbolOrder[left]!.localeCompare(context.symbolOrder[right]!);
  });

  const sectorCounts = new Map<string, { sector: string | null; count: number }>();
  for (const index of sortedIndices) {
    const symbol = context.symbolOrder[index]!;
    const sector = context.sectorBySymbol.get(symbol) ?? null;
    const key = sector ?? '__null__';
    const current = sectorCounts.get(key) ?? { sector, count: 0 };
    current.count += 1;
    sectorCounts.set(key, current);
  }

  const sectors = [...sectorCounts.values()].sort((left, right) => {
    const countDiff = right.count - left.count;
    if (countDiff !== 0) {
      return countDiff;
    }

    const leftSector = left.sector ?? 'zzzz';
    const rightSector = right.sector ?? 'zzzz';
    return leftSector.localeCompare(rightSector);
  });

  return {
    indices: sortedIndices,
    symbols: sortedIndices.map((index) => context.symbolOrder[index]!),
    dominantSector: sectors[0]?.sector ?? null,
    averageInternalScore: averageClusterInternalScore(sortedIndices, context.scores),
    sectors
  };
}

function averageInternalStrength(index: number, clusterIndices: number[], scores: number[][]): number {
  if (clusterIndices.length <= 1) {
    return 0;
  }

  let sum = 0;
  let count = 0;

  for (const otherIndex of clusterIndices) {
    if (otherIndex === index) {
      continue;
    }

    sum += scores[index]?.[otherIndex] ?? 0;
    count += 1;
  }

  return count > 0 ? sum / count : 0;
}

function averageClusterInternalScore(indices: number[], scores: number[][]): number | null {
  if (indices.length <= 1) {
    return null;
  }

  let sum = 0;
  let count = 0;

  for (let i = 0; i < indices.length; i += 1) {
    for (let j = i + 1; j < indices.length; j += 1) {
      sum += scores[indices[i]!]![indices[j]!]!;
      count += 1;
    }
  }

  return count > 0 ? sum / count : null;
}

function buildClusterLookup(summary: BuildRunStructureSummary): Map<string, StructureClusterSummary> {
  const map = new Map<string, StructureClusterSummary>();

  for (const cluster of summary.clusters) {
    for (const symbol of cluster.symbols) {
      map.set(symbol, cluster);
    }
  }

  return map;
}