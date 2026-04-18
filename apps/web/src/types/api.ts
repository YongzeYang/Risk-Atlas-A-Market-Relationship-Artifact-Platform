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
export type AnalysisRunKind = 'pair_divergence' | 'exposure' | 'structure';
export type AnalysisRunStatus = 'pending' | 'running' | 'succeeded' | 'failed';

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
  supportedDatasetIds: string[] | null;
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

export type ExposureStrengthBand = 'very_high' | 'high' | 'moderate' | 'low';

export type ExposureNeighborEntry = {
  symbol: string;
  score: number;
  sector: string | null;
  securityType: string | null;
  sameSector: boolean;
  strengthBand: ExposureStrengthBand;
};

export type ExposureSectorSummary = {
  sector: string | null;
  count: number;
  weightShare: number;
  averageScore: number;
};

export type ExposureBandSummary = {
  band: ExposureStrengthBand;
  count: number;
};

export type ExposureResponse = {
  buildRunId: string;
  asOfDate: string;
  symbol: string;
  anchorSector: string | null;
  k: number;
  neighborCount: number;
  averageNeighborScore: number;
  concentrationIndex: number;
  effectiveNeighborCount: number;
  sameSectorCount: number;
  sameSectorWeightShare: number;
  sectors: ExposureSectorSummary[];
  bands: ExposureBandSummary[];
  neighbors: ExposureNeighborEntry[];
};

export type HeatmapSubsetResponse = {
  buildRunId: string;
  symbolOrder: string[];
  scores: number[][];
};

export type PairDivergenceCandidate = {
  left: string;
  right: string;
  leftSector: string | null;
  rightSector: string | null;
  sameSector: boolean;
  longWindowCorr: number;
  recentCorr: number;
  corrDelta: number;
  recentRelativeReturnGap: number;
  spreadZScore: number | null;
};

export type PairDivergenceResponse = {
  buildRunId: string;
  asOfDate: string;
  symbolCount: number;
  longWindowDays: BuildRunWindowDays;
  recentWindowDays: number;
  minLongCorrAbs: number;
  minCorrDeltaAbs: number;
  limit: number;
  candidateCount: number;
  candidates: PairDivergenceCandidate[];
};

export type PairDivergenceAnalysisRunRequest = {
  buildRunId: string;
  recentWindowDays: number;
  limit: number;
  minLongCorrAbs: number;
  minCorrDeltaAbs: number;
};

export type ExposureAnalysisRunRequest = {
  buildRunId: string;
  symbol: string;
  k: number;
};

export type StructureAnalysisRunRequest = {
  buildRunId: string;
  heatmapSize: number;
};

export type StructureClusterSectorSummary = {
  sector: string | null;
  count: number;
};

export type StructureClusterSummary = {
  id: number;
  size: number;
  dominantSector: string | null;
  averageInternalScore: number | null;
  symbols: string[];
  sectors: StructureClusterSectorSummary[];
};

export type StructureResponse = {
  buildRunId: string;
  asOfDate: string;
  symbolCount: number;
  clusterThreshold: number;
  clusterCount: number;
  orderedSymbols: string[];
  heatmapSymbols: string[];
  heatmapScores: number[][];
  clusters: StructureClusterSummary[];
};

export type StructureClusterMatch = {
  leftClusterId: number;
  rightClusterId: number;
  overlapCount: number;
};

export type StructureMovedSymbol = {
  symbol: string;
  leftClusterId: number;
  rightClusterId: number;
  leftClusterSize: number;
  rightClusterSize: number;
  leftDominantSector: string | null;
  rightDominantSector: string | null;
};

export type CompareBuildStructuresResponse = {
  left: { id: string; asOfDate: string; symbolCount: number; clusterCount: number };
  right: { id: string; asOfDate: string; symbolCount: number; clusterCount: number };
  commonSymbolCount: number;
  stableSymbolCount: number;
  changedSymbolCount: number;
  clusterMatches: StructureClusterMatch[];
  movedSymbols: StructureMovedSymbol[];
};

type AnalysisRunBase = {
  id: string;
  kind: AnalysisRunKind;
  buildRunId: string;
  status: AnalysisRunStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
};

export type PairDivergenceAnalysisRunListItem = AnalysisRunBase & {
  kind: 'pair_divergence';
  request: PairDivergenceAnalysisRunRequest;
};

export type ExposureAnalysisRunListItem = AnalysisRunBase & {
  kind: 'exposure';
  request: ExposureAnalysisRunRequest;
};

export type StructureAnalysisRunListItem = AnalysisRunBase & {
  kind: 'structure';
  request: StructureAnalysisRunRequest;
};

export type AnalysisRunListItem =
  | PairDivergenceAnalysisRunListItem
  | ExposureAnalysisRunListItem
  | StructureAnalysisRunListItem;

export type PairDivergenceAnalysisRunDetailResponse = PairDivergenceAnalysisRunListItem & {
  result: PairDivergenceResponse | null;
};

export type ExposureAnalysisRunDetailResponse = ExposureAnalysisRunListItem & {
  result: ExposureResponse | null;
};

export type StructureAnalysisRunDetailResponse = StructureAnalysisRunListItem & {
  result: StructureResponse | null;
};

export type AnalysisRunDetailResponse =
  | PairDivergenceAnalysisRunDetailResponse
  | ExposureAnalysisRunDetailResponse
  | StructureAnalysisRunDetailResponse;