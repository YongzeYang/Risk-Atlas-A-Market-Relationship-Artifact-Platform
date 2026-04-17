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
  type PairScoreResponse,
  type PreviewV1
} from '../contracts/build-runs.js';
import { readPreviewArtifact } from './local-artifact-store.js';

type LoadedPreviewContext = {
  buildRunId: string;
  preview: PreviewV1;
  symbolIndexBySymbol: Map<string, number>;
};

export async function getBuildRunPairScore(
  buildRunId: string,
  query: PairScoreQuerystring
): Promise<PairScoreResponse> {
  const context = await requireSucceededBuildPreview(buildRunId);

  const left = normalizeSymbol(query.left);
  const right = normalizeSymbol(query.right);

  const leftIndex = requireSymbolIndex(context, left);
  const rightIndex = requireSymbolIndex(context, right);
  const score = requireFiniteScore(context.preview, leftIndex, rightIndex);

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
  const context = await requireSucceededBuildPreview(buildRunId);

  const symbol = normalizeSymbol(query.symbol);
  const index = requireSymbolIndex(context, symbol);

  const k = query.k ?? DEFAULT_NEIGHBOR_K;
  if (!Number.isInteger(k) || k < 1 || k > MAX_NEIGHBOR_K) {
    throw new ServiceError(
      400,
      `Query parameter "k" must be an integer between 1 and ${MAX_NEIGHBOR_K}.`
    );
  }

  const neighbors: NeighborEntry[] = context.preview.symbolOrder
    .map((candidateSymbol, candidateIndex) => ({
      symbol: candidateSymbol,
      score: requireFiniteScore(context.preview, index, candidateIndex)
    }))
    .filter((entry) => entry.symbol !== symbol)
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
  const context = await requireSucceededBuildPreview(buildRunId);

  if (
    body.symbols.length < MIN_HEATMAP_SUBSET_SIZE ||
    body.symbols.length > MAX_HEATMAP_SUBSET_SIZE
  ) {
    throw new ServiceError(
      400,
      `Body field "symbols" must contain between ${MIN_HEATMAP_SUBSET_SIZE} and ${MAX_HEATMAP_SUBSET_SIZE} symbols.`
    );
  }

  const symbolOrder = body.symbols.map(normalizeSymbol);
  const uniqueSymbols = new Set(symbolOrder);

  if (uniqueSymbols.size !== symbolOrder.length) {
    throw new ServiceError(400, 'Body field "symbols" must not contain duplicates.');
  }

  const indices = symbolOrder.map((symbol) => requireSymbolIndex(context, symbol));

  const scores = indices.map((rowIndex) =>
    indices.map((colIndex) => requireFiniteScore(context.preview, rowIndex, colIndex))
  );

  return {
    buildRunId,
    symbolOrder,
    scores
  };
}

async function requireSucceededBuildPreview(
  buildRunId: string
): Promise<LoadedPreviewContext> {
  const buildRun = await prisma.buildRun.findUnique({
    where: {
      id: buildRunId
    },
    select: {
      id: true,
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
    throw new ServiceError(409, `Build run "${buildRunId}" is not ready for preview queries.`);
  }

  const preview = await readPreviewArtifact(
    buildRun.artifact.storageKind,
    buildRun.artifact.storagePrefix
  );

  validatePreviewShape(preview);

  if (preview.buildRunId !== buildRunId) {
    throw new Error(
      `Preview buildRunId mismatch: expected "${buildRunId}", got "${preview.buildRunId}".`
    );
  }

  const symbolIndexBySymbol = new Map(
    preview.symbolOrder.map((symbol, index) => [symbol, index] as const)
  );

  return {
    buildRunId,
    preview,
    symbolIndexBySymbol
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
      throw new Error(
        `Preview score matrix row ${i} has length ${row.length}, expected ${n}.`
      );
    }
  }
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function requireSymbolIndex(context: LoadedPreviewContext, symbol: string): number {
  const index = context.symbolIndexBySymbol.get(symbol);

  if (index === undefined) {
    throw new ServiceError(
      404,
      `Symbol "${symbol}" was not found in build run "${context.buildRunId}".`
    );
  }

  return index;
}

function requireFiniteScore(preview: PreviewV1, rowIndex: number, colIndex: number): number {
  const score = preview.scores[rowIndex]?.[colIndex];

  if (!Number.isFinite(score)) {
    throw new Error(
      `Encountered non-finite score at [${rowIndex}, ${colIndex}] in preview artifact.`
    );
  }

  return score;
}