// apps/web/src/features/builds/api.ts
import { apiRequest } from '../../lib/http';
import type {
  BuildRunDetailResponse,
  BuildRunListItem,
  CreateBuildRunInput,
  HeatmapSubsetResponse,
  NeighborsResponse,
  PairScoreResponse
} from '../../types/api';

export async function createBuildRun(input: CreateBuildRunInput): Promise<BuildRunListItem> {
  return apiRequest<BuildRunListItem>('/build-runs', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function listBuildRuns(): Promise<BuildRunListItem[]> {
  return apiRequest<BuildRunListItem[]>('/build-runs');
}

export async function getBuildRunDetail(id: string): Promise<BuildRunDetailResponse> {
  return apiRequest<BuildRunDetailResponse>(`/build-runs/${id}`);
}

export async function getPairScore(
  id: string,
  params: { left: string; right: string }
): Promise<PairScoreResponse> {
  const search = new URLSearchParams({
    left: params.left,
    right: params.right
  });

  return apiRequest<PairScoreResponse>(`/build-runs/${id}/pair-score?${search.toString()}`);
}

export async function getNeighbors(
  id: string,
  params: { symbol: string; k: number }
): Promise<NeighborsResponse> {
  const search = new URLSearchParams({
    symbol: params.symbol,
    k: String(params.k)
  });

  return apiRequest<NeighborsResponse>(`/build-runs/${id}/neighbors?${search.toString()}`);
}

export async function getHeatmapSubset(
  id: string,
  symbols: string[]
): Promise<HeatmapSubsetResponse> {
  return apiRequest<HeatmapSubsetResponse>(`/build-runs/${id}/heatmap-subset`, {
    method: 'POST',
    body: JSON.stringify({
      symbols
    })
  });
}