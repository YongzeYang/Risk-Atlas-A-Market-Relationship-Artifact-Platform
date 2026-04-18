import { prisma } from '../lib/prisma.js';
import { ServiceError } from '../lib/service-error.js';
import {
  DEFAULT_NEIGHBOR_K,
  MAX_NEIGHBOR_K,
  MAX_HEATMAP_SUBSET_SIZE,
  MIN_HEATMAP_SUBSET_SIZE,
  type HeatmapSubsetRequestBody,
  type HeatmapSubsetResponse,
  type NeighborEntry,
  type NeighborsQuerystring,
  type NeighborsResponse,
  type PairScoreQuerystring,
  type PairScoreResponse
} from '../contracts/build-runs.js';
import {
  loadSucceededBuildRunArtifactContext,
  normalizeArtifactSymbol,
  requireArtifactSymbolIndex
} from './build-run-artifact-context.js';
import {
  queryBsmPairScore,
  queryBsmRowTopk,
  queryBsmSubmatrix
} from './bsm-reader.js';

export async function getBuildRunPairScore(
  buildRunId: string,
  query: PairScoreQuerystring
): Promise<PairScoreResponse> {
  const context = await loadSucceededBuildRunArtifactContext(
    buildRunId,
    `Build run "${buildRunId}" is not ready for pair-score queries.`
  );

  const left = normalizeArtifactSymbol(query.left);
  const right = normalizeArtifactSymbol(query.right);

  const leftIndex = requireArtifactSymbolIndex(context, left);
  const rightIndex = requireArtifactSymbolIndex(context, right);
  const { score } = await queryBsmPairScore(context.matrixPath, leftIndex, rightIndex);

  return {
    buildRunId,
    left,
    right,
    score
  };
}

export async function getBuildRunNeighbors(
  buildRunId: string,
  query: NeighborsQuerystring
): Promise<NeighborsResponse> {
  const context = await loadSucceededBuildRunArtifactContext(
    buildRunId,
    `Build run "${buildRunId}" is not ready for neighbor queries.`
  );

  const symbol = normalizeArtifactSymbol(query.symbol);
  const index = requireArtifactSymbolIndex(context, symbol);

  const k = query.k ?? DEFAULT_NEIGHBOR_K;
  if (!Number.isInteger(k) || k < 1 || k > MAX_NEIGHBOR_K) {
    throw new ServiceError(
      400,
      `Query parameter "k" must be an integer between 1 and ${MAX_NEIGHBOR_K}.`
    );
  }

  const rowTopk = await queryBsmRowTopk(context.matrixPath, index, k + 1);

  const neighbors: NeighborEntry[] = rowTopk
    .map((entry) => ({
      symbol: context.preview.symbolOrder[entry.index] ?? '',
      score: entry.score
    }))
    .filter((entry) => entry.symbol.length > 0 && entry.symbol !== symbol)
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return a.symbol.localeCompare(b.symbol);
    })
    .slice(0, k);

  return {
    buildRunId,
    symbol,
    k,
    neighbors
  };
}

export async function getBuildRunHeatmapSubset(
  buildRunId: string,
  body: HeatmapSubsetRequestBody
): Promise<HeatmapSubsetResponse> {
  const context = await loadSucceededBuildRunArtifactContext(
    buildRunId,
    `Build run "${buildRunId}" is not ready for heatmap queries.`
  );

  if (
    body.symbols.length < MIN_HEATMAP_SUBSET_SIZE ||
    body.symbols.length > MAX_HEATMAP_SUBSET_SIZE
  ) {
    throw new ServiceError(
      400,
      `Body field "symbols" must contain between ${MIN_HEATMAP_SUBSET_SIZE} and ${MAX_HEATMAP_SUBSET_SIZE} symbols.`
    );
  }

  const symbolOrder = body.symbols.map(normalizeArtifactSymbol);
  const uniqueSymbols = new Set(symbolOrder);

  if (uniqueSymbols.size !== symbolOrder.length) {
    throw new ServiceError(400, 'Body field "symbols" must not contain duplicates.');
  }

  const indices = symbolOrder.map((symbol) => requireArtifactSymbolIndex(context, symbol));
  const submatrix = await queryBsmSubmatrix(context.matrixPath, indices);

  return {
    buildRunId,
    symbolOrder,
    scores: submatrix.scores
  };
}