export const BUILD_RUN_SCORE_METHODS = ['pearson_corr'] as const;
export type BuildRunScoreMethod = (typeof BUILD_RUN_SCORE_METHODS)[number];

export const BUILD_RUN_WINDOW_DAYS = [60, 120, 252] as const;
export type BuildRunWindowDays = (typeof BUILD_RUN_WINDOW_DAYS)[number];

export const BUILD_RUN_STATUSES = ['pending', 'running', 'succeeded', 'failed'] as const;
export type BuildRunStatus = (typeof BUILD_RUN_STATUSES)[number];

export const ARTIFACT_STORAGE_KINDS = ['local_fs', 's3'] as const;
export type ArtifactStorageKind = (typeof ARTIFACT_STORAGE_KINDS)[number];

export const ARTIFACT_BUNDLE_VERSION = 1 as const;
export const PREVIEW_FORMAT = 'risk_atlas_preview_v1' as const;
export const MANIFEST_FORMAT = 'risk_atlas_manifest_v1' as const;

export const ARTIFACT_FILE_NAMES = {
  matrix: 'matrix.bsm',
  preview: 'preview.json',
  manifest: 'manifest.json'
} as const;

export const LOCAL_ARTIFACT_ROOT_DIR = 'artifacts' as const;
export const ARTIFACT_OBJECT_PREFIX_ROOT = 'build-runs' as const;

export const MATRIX_ARTIFACT_MEDIA_TYPE = 'application/octet-stream' as const;

export const MIN_BUILD_UNIVERSE_SIZE = 2;
export const MAX_BUILD_UNIVERSE_SIZE = 500;

export const DEFAULT_NEIGHBOR_K = 10;
export const MAX_NEIGHBOR_K = 20;

export const MIN_HEATMAP_SUBSET_SIZE = 2;
export const MAX_HEATMAP_SUBSET_SIZE = 12;

export const DEFAULT_PAIR_DIVERGENCE_RECENT_WINDOW_DAYS = 20;
export const MIN_PAIR_DIVERGENCE_RECENT_WINDOW_DAYS = 10;
export const MAX_PAIR_DIVERGENCE_RECENT_WINDOW_DAYS = 60;

export const DEFAULT_PAIR_DIVERGENCE_LIMIT = 50;
export const MAX_PAIR_DIVERGENCE_LIMIT = 200;

export const DEFAULT_PAIR_DIVERGENCE_MIN_LONG_CORR_ABS = 0.35;
export const DEFAULT_PAIR_DIVERGENCE_MIN_CORR_DELTA_ABS = 0.12;

export const TOP_PAIR_LIMIT = 20;

export const BUILD_SERIES_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export type BuildSeriesFrequency = (typeof BUILD_SERIES_FREQUENCIES)[number];

export const BUILD_SERIES_STATUSES = [
  'pending',
  'running',
  'succeeded',
  'partially_failed',
  'failed'
] as const;
export type BuildSeriesStatus = (typeof BUILD_SERIES_STATUSES)[number];

export const ISO_DATE_PATTERN_SOURCE = '^\\d{4}-\\d{2}-\\d{2}$';
export const HK_SYMBOL_PATTERN_SOURCE = '^\\d{4}\\.HK$';

export function isBuildRunScoreMethod(value: string): value is BuildRunScoreMethod {
  return (BUILD_RUN_SCORE_METHODS as readonly string[]).includes(value);
}

export function isBuildRunWindowDays(value: number): value is BuildRunWindowDays {
  return (BUILD_RUN_WINDOW_DAYS as readonly number[]).includes(value);
}

export function makeArtifactStoragePrefix(buildRunId: string): string {
  return `${ARTIFACT_OBJECT_PREFIX_ROOT}/${buildRunId}`;
}

export type BuildRunIdParams = {
  id: string;
};

export type CreateBuildRunRequestBody = {
  datasetId: string;
  universeId: string;
  asOfDate: string;
  windowDays: BuildRunWindowDays;
  scoreMethod: BuildRunScoreMethod;
  inviteCode?: string;
};

export type CreateBuildSeriesRequestBody = {
  name: string;
  datasetId: string;
  universeId: string;
  windowDays: BuildRunWindowDays;
  scoreMethod: BuildRunScoreMethod;
  startDate: string;
  endDate: string;
  frequency: BuildSeriesFrequency;
  inviteCode?: string;
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

export type CompareBuildsQuerystring = {
  leftId: string;
  rightId: string;
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
  mediaType: typeof MATRIX_ARTIFACT_MEDIA_TYPE;
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

export type PairScoreQuerystring = {
  left: string;
  right: string;
};

export type PairScoreResponse = {
  buildRunId: string;
  left: string;
  right: string;
  score: number;
};

export type NeighborsQuerystring = {
  symbol: string;
  k?: number;
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

export type HeatmapSubsetRequestBody = {
  symbols: string[];
};

export type HeatmapSubsetResponse = {
  buildRunId: string;
  symbolOrder: string[];
  scores: number[][];
};

export type PairDivergenceQuerystring = {
  recentWindowDays?: number;
  limit?: number;
  minLongCorrAbs?: number;
  minCorrDeltaAbs?: number;
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

export type PreviewV1 = {
  format: typeof PREVIEW_FORMAT;
  buildRunId: string;
  datasetId: string;
  universeId: string;
  asOfDate: string;
  windowDays: BuildRunWindowDays;
  scoreMethod: BuildRunScoreMethod;
  symbolOrder: string[];
  scores: number[][];
  topPairs: TopPairItem[];
  minScore: number;
  maxScore: number;
};

export type ManifestFileEntry = {
  filename: string;
  mediaType: string;
  byteSize: number | null;
};

export type ManifestV1 = {
  format: typeof MANIFEST_FORMAT;
  artifactBundleVersion: typeof ARTIFACT_BUNDLE_VERSION;
  buildRunId: string;
  datasetId: string;
  universeId: string;
  asOfDate: string;
  windowDays: BuildRunWindowDays;
  scoreMethod: BuildRunScoreMethod;
  symbolCount: number;
  symbolOrder: string[];
  files: {
    matrix: ManifestFileEntry;
    preview: ManifestFileEntry;
    manifest: ManifestFileEntry;
  };
  stats: {
    minScore: number;
    maxScore: number;
    topPairCount: number;
  };
  createdAt: string;
};

const nullableStringSchema = {
  anyOf: [{ type: 'string' }, { type: 'null' }]
} as const;

const nullableDateTimeSchema = {
  anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }]
} as const;

const nullableNumberSchema = {
  anyOf: [{ type: 'number' }, { type: 'null' }]
} as const;

const nullableIntegerSchema = {
  anyOf: [{ type: 'integer' }, { type: 'null' }]
} as const;

export const buildRunIdParamSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' }
  },
  required: ['id']
} as const;

export const createBuildRunBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    datasetId: { type: 'string', minLength: 1 },
    universeId: { type: 'string', minLength: 1 },
    asOfDate: { type: 'string', pattern: ISO_DATE_PATTERN_SOURCE },
    windowDays: { type: 'integer', enum: [...BUILD_RUN_WINDOW_DAYS] },
    scoreMethod: { type: 'string', enum: [...BUILD_RUN_SCORE_METHODS] },
    inviteCode: { type: 'string', minLength: 1 }
  },
  required: ['datasetId', 'universeId', 'asOfDate', 'windowDays', 'scoreMethod', 'inviteCode']
} as const;

export const createBuildSeriesBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    datasetId: { type: 'string', minLength: 1 },
    universeId: { type: 'string', minLength: 1 },
    windowDays: { type: 'integer', enum: [...BUILD_RUN_WINDOW_DAYS] },
    scoreMethod: { type: 'string', enum: [...BUILD_RUN_SCORE_METHODS] },
    startDate: { type: 'string', pattern: ISO_DATE_PATTERN_SOURCE },
    endDate: { type: 'string', pattern: ISO_DATE_PATTERN_SOURCE },
    frequency: { type: 'string', enum: [...BUILD_SERIES_FREQUENCIES] },
    inviteCode: { type: 'string', minLength: 1 }
  },
  required: ['name', 'datasetId', 'universeId', 'windowDays', 'scoreMethod', 'startDate', 'endDate', 'frequency', 'inviteCode']
} as const;

export const buildSeriesListItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    datasetId: { type: 'string' },
    universeId: { type: 'string' },
    windowDays: { type: 'integer', enum: [...BUILD_RUN_WINDOW_DAYS] },
    scoreMethod: { type: 'string', enum: [...BUILD_RUN_SCORE_METHODS] },
    startDate: { type: 'string', pattern: ISO_DATE_PATTERN_SOURCE },
    endDate: { type: 'string', pattern: ISO_DATE_PATTERN_SOURCE },
    frequency: { type: 'string', enum: [...BUILD_SERIES_FREQUENCIES] },
    status: { type: 'string', enum: [...BUILD_SERIES_STATUSES] },
    totalRunCount: { type: 'integer' },
    completedRunCount: { type: 'integer' },
    failedRunCount: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
    startedAt: nullableDateTimeSchema,
    finishedAt: nullableDateTimeSchema
  },
  required: [
    'id', 'name', 'datasetId', 'universeId', 'windowDays', 'scoreMethod',
    'startDate', 'endDate', 'frequency', 'status', 'totalRunCount',
    'completedRunCount', 'failedRunCount', 'createdAt', 'startedAt', 'finishedAt'
  ]
} as const;

export const buildSeriesRunItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    asOfDate: { type: 'string', pattern: ISO_DATE_PATTERN_SOURCE },
    status: { type: 'string', enum: [...BUILD_RUN_STATUSES] },
    createdAt: { type: 'string', format: 'date-time' },
    startedAt: nullableDateTimeSchema,
    finishedAt: nullableDateTimeSchema,
    errorMessage: { type: ['string', 'null'] }
  },
  required: ['id', 'asOfDate', 'status', 'createdAt', 'startedAt', 'finishedAt', 'errorMessage']
} as const;

export const buildSeriesDetailResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...buildSeriesListItemSchema.properties,
    runs: { type: 'array', items: buildSeriesRunItemSchema }
  },
  required: [...buildSeriesListItemSchema.required, 'runs']
} as const;

export const compareBuildsQuerystringSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    leftId: { type: 'string', minLength: 1 },
    rightId: { type: 'string', minLength: 1 }
  },
  required: ['leftId', 'rightId']
} as const;

export const buildRunListItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    datasetId: { type: 'string' },
    universeId: { type: 'string' },
    asOfDate: { type: 'string', pattern: ISO_DATE_PATTERN_SOURCE },
    windowDays: { type: 'integer', enum: [...BUILD_RUN_WINDOW_DAYS] },
    scoreMethod: { type: 'string', enum: [...BUILD_RUN_SCORE_METHODS] },
    status: { type: 'string', enum: [...BUILD_RUN_STATUSES] },
    createdAt: { type: 'string', format: 'date-time' },
    startedAt: nullableDateTimeSchema,
    finishedAt: nullableDateTimeSchema,
    errorMessage: nullableStringSchema
  },
  required: [
    'id',
    'datasetId',
    'universeId',
    'asOfDate',
    'windowDays',
    'scoreMethod',
    'status',
    'createdAt',
    'startedAt',
    'finishedAt',
    'errorMessage'
  ]
} as const;

export const buildRunListResponseSchema = {
  type: 'array',
  items: buildRunListItemSchema
} as const;

export const topPairItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    left: { type: 'string', pattern: HK_SYMBOL_PATTERN_SOURCE },
    right: { type: 'string', pattern: HK_SYMBOL_PATTERN_SOURCE },
    score: { type: 'number' }
  },
  required: ['left', 'right', 'score']
} as const;

export const artifactSummarySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    bundleVersion: { type: 'integer', enum: [ARTIFACT_BUNDLE_VERSION] },
    storageKind: { type: 'string', enum: [...ARTIFACT_STORAGE_KINDS] },
    storageBucket: nullableStringSchema,
    storagePrefix: { type: 'string' },
    symbolCount: { type: 'integer' },
    minScore: nullableNumberSchema,
    maxScore: nullableNumberSchema,
    matrixByteSize: nullableIntegerSchema,
    previewByteSize: nullableIntegerSchema,
    manifestByteSize: nullableIntegerSchema
  },
  required: [
    'id',
    'bundleVersion',
    'storageKind',
    'storageBucket',
    'storagePrefix',
    'symbolCount',
    'minScore',
    'maxScore',
    'matrixByteSize',
    'previewByteSize',
    'manifestByteSize'
  ]
} as const;

export const artifactDownloadInfoSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    url: { type: 'string' },
    filename: { type: 'string' },
    mediaType: { type: 'string', enum: [MATRIX_ARTIFACT_MEDIA_TYPE] }
  },
  required: ['url', 'filename', 'mediaType']
} as const;

export const buildRunDetailResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    datasetId: { type: 'string' },
    universeId: { type: 'string' },
    asOfDate: { type: 'string', pattern: ISO_DATE_PATTERN_SOURCE },
    windowDays: { type: 'integer', enum: [...BUILD_RUN_WINDOW_DAYS] },
    scoreMethod: { type: 'string', enum: [...BUILD_RUN_SCORE_METHODS] },
    status: { type: 'string', enum: [...BUILD_RUN_STATUSES] },
    createdAt: { type: 'string', format: 'date-time' },
    startedAt: nullableDateTimeSchema,
    finishedAt: nullableDateTimeSchema,
    errorMessage: nullableStringSchema,
    durationMs: nullableIntegerSchema,
    symbolCount: nullableIntegerSchema,
    minScore: nullableNumberSchema,
    maxScore: nullableNumberSchema,
    artifact: {
      anyOf: [artifactSummarySchema, { type: 'null' }]
    },
    artifactDownload: {
      anyOf: [artifactDownloadInfoSchema, { type: 'null' }]
    },
    symbolOrder: {
      type: 'array',
      items: { type: 'string', pattern: HK_SYMBOL_PATTERN_SOURCE }
    },
    topPairs: {
      type: 'array',
      items: topPairItemSchema
    }
  },
  required: [
    'id',
    'datasetId',
    'universeId',
    'asOfDate',
    'windowDays',
    'scoreMethod',
    'status',
    'createdAt',
    'startedAt',
    'finishedAt',
    'errorMessage',
    'durationMs',
    'symbolCount',
    'minScore',
    'maxScore',
    'artifact',
    'artifactDownload',
    'symbolOrder',
    'topPairs'
  ]
} as const;

export const pairScoreQuerystringSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    left: { type: 'string', pattern: HK_SYMBOL_PATTERN_SOURCE },
    right: { type: 'string', pattern: HK_SYMBOL_PATTERN_SOURCE }
  },
  required: ['left', 'right']
} as const;

export const pairScoreResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    buildRunId: { type: 'string' },
    left: { type: 'string', pattern: HK_SYMBOL_PATTERN_SOURCE },
    right: { type: 'string', pattern: HK_SYMBOL_PATTERN_SOURCE },
    score: { type: 'number' }
  },
  required: ['buildRunId', 'left', 'right', 'score']
} as const;

export const neighborsQuerystringSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    symbol: { type: 'string', pattern: HK_SYMBOL_PATTERN_SOURCE },
    k: {
      type: 'integer',
      minimum: 1,
      maximum: MAX_NEIGHBOR_K,
      default: DEFAULT_NEIGHBOR_K
    }
  },
  required: ['symbol']
} as const;

export const neighborEntrySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    symbol: { type: 'string', pattern: HK_SYMBOL_PATTERN_SOURCE },
    score: { type: 'number' }
  },
  required: ['symbol', 'score']
} as const;

export const neighborsResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    buildRunId: { type: 'string' },
    symbol: { type: 'string', pattern: HK_SYMBOL_PATTERN_SOURCE },
    k: { type: 'integer' },
    neighbors: {
      type: 'array',
      items: neighborEntrySchema
    }
  },
  required: ['buildRunId', 'symbol', 'k', 'neighbors']
} as const;

export const heatmapSubsetBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    symbols: {
      type: 'array',
      minItems: MIN_HEATMAP_SUBSET_SIZE,
      maxItems: MAX_HEATMAP_SUBSET_SIZE,
      items: { type: 'string', pattern: HK_SYMBOL_PATTERN_SOURCE }
    }
  },
  required: ['symbols']
} as const;

export const heatmapSubsetResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    buildRunId: { type: 'string' },
    symbolOrder: {
      type: 'array',
      items: { type: 'string', pattern: HK_SYMBOL_PATTERN_SOURCE }
    },
    scores: {
      type: 'array',
      items: {
        type: 'array',
        items: { type: 'number' }
      }
    }
  },
  required: ['buildRunId', 'symbolOrder', 'scores']
} as const;

export const pairDivergenceQuerystringSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    recentWindowDays: {
      type: 'integer',
      minimum: MIN_PAIR_DIVERGENCE_RECENT_WINDOW_DAYS,
      maximum: MAX_PAIR_DIVERGENCE_RECENT_WINDOW_DAYS,
      default: DEFAULT_PAIR_DIVERGENCE_RECENT_WINDOW_DAYS
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: MAX_PAIR_DIVERGENCE_LIMIT,
      default: DEFAULT_PAIR_DIVERGENCE_LIMIT
    },
    minLongCorrAbs: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      default: DEFAULT_PAIR_DIVERGENCE_MIN_LONG_CORR_ABS
    },
    minCorrDeltaAbs: {
      type: 'number',
      minimum: 0,
      maximum: 2,
      default: DEFAULT_PAIR_DIVERGENCE_MIN_CORR_DELTA_ABS
    }
  }
} as const;

export const pairDivergenceCandidateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    left: { type: 'string', pattern: HK_SYMBOL_PATTERN_SOURCE },
    right: { type: 'string', pattern: HK_SYMBOL_PATTERN_SOURCE },
    leftSector: nullableStringSchema,
    rightSector: nullableStringSchema,
    sameSector: { type: 'boolean' },
    longWindowCorr: { type: 'number' },
    recentCorr: { type: 'number' },
    corrDelta: { type: 'number' },
    recentRelativeReturnGap: { type: 'number' },
    spreadZScore: nullableNumberSchema
  },
  required: [
    'left',
    'right',
    'leftSector',
    'rightSector',
    'sameSector',
    'longWindowCorr',
    'recentCorr',
    'corrDelta',
    'recentRelativeReturnGap',
    'spreadZScore'
  ]
} as const;

export const pairDivergenceResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    buildRunId: { type: 'string' },
    asOfDate: { type: 'string', pattern: ISO_DATE_PATTERN_SOURCE },
    symbolCount: { type: 'integer' },
    longWindowDays: { type: 'integer', enum: [...BUILD_RUN_WINDOW_DAYS] },
    recentWindowDays: { type: 'integer' },
    minLongCorrAbs: { type: 'number' },
    minCorrDeltaAbs: { type: 'number' },
    limit: { type: 'integer' },
    candidateCount: { type: 'integer' },
    candidates: {
      type: 'array',
      items: pairDivergenceCandidateSchema
    }
  },
  required: [
    'buildRunId',
    'asOfDate',
    'symbolCount',
    'longWindowDays',
    'recentWindowDays',
    'minLongCorrAbs',
    'minCorrDeltaAbs',
    'limit',
    'candidateCount',
    'candidates'
  ]
} as const;