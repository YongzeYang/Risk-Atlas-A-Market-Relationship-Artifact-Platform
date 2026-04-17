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

export const MIN_BUILD_UNIVERSE_SIZE = 2;
export const MAX_BUILD_UNIVERSE_SIZE = 50;
export const DEFAULT_NEIGHBOR_K = 10;
export const MAX_NEIGHBOR_K = 20;
export const MIN_HEATMAP_SUBSET_SIZE = 2;
export const MAX_HEATMAP_SUBSET_SIZE = 12;
export const TOP_PAIR_LIMIT = 20;

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

export type BuildRunDetailResponse = BuildRunListItem & {
  artifact: ArtifactSummary | null;
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
    scoreMethod: { type: 'string', enum: [...BUILD_RUN_SCORE_METHODS] }
  },
  required: ['datasetId', 'universeId', 'asOfDate', 'windowDays', 'scoreMethod']
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
    artifact: {
      anyOf: [artifactSummarySchema, { type: 'null' }]
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
    'artifact',
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