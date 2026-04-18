// apps/web/src/features/builds/api.ts
import { apiRequest } from '../../lib/http';
import type {
  BuildRunDetailResponse,
  BuildRunListItem,
  BuildSeriesDetailResponse,
  BuildSeriesListItem,
  CompareBuildsResponse,
  CreateBuildRunInput,
  CreateBuildSeriesInput,
  HeatmapSubsetResponse,
  NeighborsResponse,
  PairDivergenceResponse,
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

export async function createBuildSeries(
  input: CreateBuildSeriesInput
): Promise<BuildSeriesListItem> {
  return apiRequest<BuildSeriesListItem>('/build-series', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function listBuildSeries(): Promise<BuildSeriesListItem[]> {
  return apiRequest<BuildSeriesListItem[]>('/build-series');
}

export async function getBuildSeriesDetail(id: string): Promise<BuildSeriesDetailResponse> {
  return apiRequest<BuildSeriesDetailResponse>(`/build-series/${id}`);
}

export async function compareBuilds(
  leftId: string,
  rightId: string
): Promise<CompareBuildsResponse> {
  const search = new URLSearchParams({ leftId, rightId });
  return apiRequest<CompareBuildsResponse>(`/compare-builds?${search.toString()}`);
}

export async function getPairDivergence(
  id: string,
  params: {
    recentWindowDays: number;
    limit: number;
    minLongCorrAbs: number;
    minCorrDeltaAbs: number;
  }
): Promise<PairDivergenceResponse> {
  const search = new URLSearchParams({
    recentWindowDays: String(params.recentWindowDays),
    limit: String(params.limit),
    minLongCorrAbs: String(params.minLongCorrAbs),
    minCorrDeltaAbs: String(params.minCorrDeltaAbs)
  });

  return apiRequest<PairDivergenceResponse>(
    `/build-runs/${id}/pair-divergence?${search.toString()}`
  );
}