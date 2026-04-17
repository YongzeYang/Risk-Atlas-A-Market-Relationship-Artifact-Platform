// apps/web/src/types/api.ts
export type BuildRunStatus = 'pending' | 'running' | 'succeeded' | 'failed';
export type BuildRunScoreMethod = 'pearson_corr';
export type BuildRunWindowDays = 60 | 120 | 252;
export type ArtifactStorageKind = 'local_fs' | 's3';

export type DatasetListItem = {
  id: string;
  name: string;
  source: string;
  market: string;
  createdAt: string;
  symbolCount: number;
  priceRowCount: number;
  minTradeDate: string | null;
  maxTradeDate: string | null;
};

export type UniverseListItem = {
  id: string;
  name: string;
  market: string;
  symbolCount: number;
  symbols: string[];
  createdAt: string;
};

export type BuildRunListItem = {
  id: string;
  datasetId: string;
  universeId: string;
  asOfDate: string;
  windowDays: BuildRunWindowDays;
  scoreMethod: BuildRunScoreMethod;
  status: BuildRunStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
};

export type TopPairItem = {
  left: string;
  right: string;
  score: number;
};

export type ArtifactSummary = {
  id: string;
  bundleVersion: number;
  storageKind: ArtifactStorageKind;
  storageBucket: string | null;
  storagePrefix: string;
  symbolCount: number;
  minScore: number | null;
  maxScore: number | null;
  matrixByteSize: number | null;
  previewByteSize: number | null;
  manifestByteSize: number | null;
};

export type ArtifactDownloadInfo = {
  url: string;
  filename: string;
  mediaType: 'application/octet-stream';
};

export type BuildRunDetailResponse = BuildRunListItem & {
  durationMs: number | null;
  symbolCount: number | null;
  minScore: number | null;
  maxScore: number | null;
  artifact: ArtifactSummary | null;
  artifactDownload: ArtifactDownloadInfo | null;
  symbolOrder: string[];
  topPairs: TopPairItem[];
};

export type CreateBuildRunInput = {
  datasetId: string;
  universeId: string;
  asOfDate: string;
  windowDays: BuildRunWindowDays;
  scoreMethod: BuildRunScoreMethod;
};

export type PairScoreResponse = {
  buildRunId: string;
  left: string;
  right: string;
  score: number;
};

export type NeighborEntry = {
  symbol: string;
  score: number;
};

export type NeighborsResponse = {
  buildRunId: string;
  symbol: string;
  k: number;
  neighbors: NeighborEntry[];
};

export type HeatmapSubsetResponse = {
  buildRunId: string;
  symbolOrder: string[];
  scores: number[][];
};