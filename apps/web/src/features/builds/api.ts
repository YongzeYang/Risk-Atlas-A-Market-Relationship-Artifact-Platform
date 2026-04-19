// apps/web/src/features/builds/api.ts
import { apiRequest } from '../../lib/http';
import type {
  AnalysisRunDetailResponse,
  AnalysisRunKind,
  AnalysisRunListItem,
  BuildRequestValidationResponse,
  BuildRunDetailResponse,
  BuildRunListItem,
  BuildSeriesDetailResponse,
  BuildSeriesListItem,
  CompareBuildsResponse,
  CompareBuildStructuresResponse,
  CreateBuildRunInput,
  CreateBuildSeriesInput,
  ExposureAnalysisRunListItem,
  ExposureResponse,
  HeatmapSubsetResponse,
  NeighborsResponse,
  PairDivergenceAnalysisRunListItem,
  PairDivergenceAnalysisRunRequest,
  PairDivergenceResponse,
  PairScoreResponse,
  ValidateBuildRunInput,
  StructureAnalysisRunListItem,
  StructureAnalysisRunRequest,
  StructureResponse
} from '../../types/api';

function analysisHeaders(inviteCode?: string): HeadersInit | undefined {
  if (!inviteCode) {
    return undefined;
  }

  return {
    'x-invite-code': inviteCode
  };
}

export async function createBuildRun(input: CreateBuildRunInput): Promise<BuildRunListItem> {
  return apiRequest<BuildRunListItem>('/build-runs', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function validateBuildRun(
  input: ValidateBuildRunInput
): Promise<BuildRequestValidationResponse> {
  return apiRequest<BuildRequestValidationResponse>('/build-runs/validate', {
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

export async function createPairDivergenceAnalysisRun(
  input: PairDivergenceAnalysisRunRequest,
  inviteCode: string
): Promise<PairDivergenceAnalysisRunListItem> {
  return apiRequest<PairDivergenceAnalysisRunListItem>('/analysis-runs/pair-divergence', {
    method: 'POST',
    headers: analysisHeaders(inviteCode),
    body: JSON.stringify(input)
  });
}

export async function createExposureAnalysisRun(
  input: { buildRunId: string; symbol: string; k: number },
  inviteCode: string
): Promise<ExposureAnalysisRunListItem> {
  return apiRequest<ExposureAnalysisRunListItem>('/analysis-runs/exposure', {
    method: 'POST',
    headers: analysisHeaders(inviteCode),
    body: JSON.stringify(input)
  });
}

export async function createStructureAnalysisRun(
  input: StructureAnalysisRunRequest,
  inviteCode: string
): Promise<StructureAnalysisRunListItem> {
  return apiRequest<StructureAnalysisRunListItem>('/analysis-runs/structure', {
    method: 'POST',
    headers: analysisHeaders(inviteCode),
    body: JSON.stringify(input)
  });
}

export async function listAnalysisRuns(params: {
  kind?: AnalysisRunKind;
  buildRunId?: string;
  limit?: number;
}): Promise<AnalysisRunListItem[]> {
  const search = new URLSearchParams();

  if (params.kind) {
    search.set('kind', params.kind);
  }
  if (params.buildRunId) {
    search.set('buildRunId', params.buildRunId);
  }
  if (params.limit != null) {
    search.set('limit', String(params.limit));
  }

  const query = search.toString();
  return apiRequest<AnalysisRunListItem[]>(query ? `/analysis-runs?${query}` : '/analysis-runs');
}

export async function getAnalysisRun(id: string): Promise<AnalysisRunDetailResponse> {
  return apiRequest<AnalysisRunDetailResponse>(`/analysis-runs/${id}`);
}

export async function compareBuilds(
  leftId: string,
  rightId: string,
  inviteCode?: string
): Promise<CompareBuildsResponse> {
  const search = new URLSearchParams({ leftId, rightId });
  return apiRequest<CompareBuildsResponse>(`/compare-builds?${search.toString()}`, {
    headers: analysisHeaders(inviteCode)
  });
}

export async function getPairDivergence(
  id: string,
  params: {
    recentWindowDays: number;
    limit: number;
    minLongCorrAbs: number;
    minCorrDeltaAbs: number;
  },
  inviteCode?: string
): Promise<PairDivergenceResponse> {
  const search = new URLSearchParams({
    recentWindowDays: String(params.recentWindowDays),
    limit: String(params.limit),
    minLongCorrAbs: String(params.minLongCorrAbs),
    minCorrDeltaAbs: String(params.minCorrDeltaAbs)
  });

  return apiRequest<PairDivergenceResponse>(
    `/build-runs/${id}/pair-divergence?${search.toString()}`,
    {
      headers: analysisHeaders(inviteCode)
    }
  );
}

export async function getBuildRunExposure(
  id: string,
  params: { symbol: string; k: number },
  inviteCode?: string
): Promise<ExposureResponse> {
  const search = new URLSearchParams({
    symbol: params.symbol,
    k: String(params.k)
  });

  return apiRequest<ExposureResponse>(`/build-runs/${id}/exposure?${search.toString()}`, {
    headers: analysisHeaders(inviteCode)
  });
}

export async function getBuildRunStructure(
  id: string,
  params: { heatmapSize: number },
  inviteCode?: string
): Promise<StructureResponse> {
  const search = new URLSearchParams({
    heatmapSize: String(params.heatmapSize)
  });

  return apiRequest<StructureResponse>(`/build-runs/${id}/structure?${search.toString()}`, {
    headers: analysisHeaders(inviteCode)
  });
}

export async function compareBuildStructures(
  leftId: string,
  rightId: string,
  inviteCode?: string
): Promise<CompareBuildStructuresResponse> {
  const search = new URLSearchParams({ leftId, rightId });
  return apiRequest<CompareBuildStructuresResponse>(
    `/compare-build-structures?${search.toString()}`,
    {
      headers: analysisHeaders(inviteCode)
    }
  );
}