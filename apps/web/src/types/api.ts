// apps/web/src/types/api.ts
export type BuildRunStatus = 'pending' | 'running' | 'succeeded' | 'failed';
export type BuildRunScoreMethod = 'pearson_corr';
export type BuildRunWindowDays = 60 | 120 | 252;
export type ArtifactStorageKind = 'local_fs' | 's3';
export type BuildSeriesFrequency = 'daily' | 'weekly' | 'monthly';
export type BuildSeriesStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'partially_failed'
  | 'failed';

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
  symbolCount: number | null;
  symbols: string[];
  definitionKind: string;
  definitionParams?: unknown;
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
  inviteCode: string;
};

export type CreateBuildSeriesInput = {
  name: string;
  datasetId: string;
  universeId: string;
  windowDays: BuildRunWindowDays;
  scoreMethod: BuildRunScoreMethod;
  startDate: string;
  endDate: string;
  frequency: BuildSeriesFrequency;
  inviteCode: string;
};

export type BuildSeriesListItem = {
  id: string;
  name: string;
  datasetId: string;
  universeId: string;
  windowDays: BuildRunWindowDays;
  scoreMethod: BuildRunScoreMethod;
  startDate: string;
  endDate: string;
  frequency: BuildSeriesFrequency;
  status: BuildSeriesStatus;
  totalRunCount: number;
  completedRunCount: number;
  failedRunCount: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type BuildSeriesRunItem = {
  id: string;
  asOfDate: string;
  status: BuildRunStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
};

export type BuildSeriesDetailResponse = BuildSeriesListItem & {
  runs: BuildSeriesRunItem[];
};

export type SecurityMasterItem = {
  symbol: string;
  name: string;
  shortName: string | null;
  securityType: string;
  sector: string | null;
  market: string;
};

export type CompareDriftEntry = {
  left: string;
  right: string;
  leftScore: number;
  rightScore: number;
  delta: number;
};

export type CompareBuildsResponse = {
  left: { id: string; asOfDate: string; symbolCount: number };
  right: { id: string; asOfDate: string; symbolCount: number };
  commonSymbols: string[];
  topDriftPairs: CompareDriftEntry[];
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