import type {
  ExposureResponse,
  PairDivergenceResponse,
  StructureResponse
} from './build-runs.js';

export const ANALYSIS_RUN_KINDS = ['pair_divergence', 'exposure', 'structure'] as const;
export type AnalysisRunKind = (typeof ANALYSIS_RUN_KINDS)[number];

export const ANALYSIS_RUN_STATUSES = ['pending', 'running', 'succeeded', 'failed'] as const;
export type AnalysisRunStatus = (typeof ANALYSIS_RUN_STATUSES)[number];

export type AnalysisRunIdParams = {
  id: string;
};

export type CreatePairDivergenceAnalysisRunRequestBody = {
  buildRunId: string;
  recentWindowDays: number;
  limit: number;
  minLongCorrAbs: number;
  minCorrDeltaAbs: number;
};

export type CreateExposureAnalysisRunRequestBody = {
  buildRunId: string;
  symbol: string;
  k: number;
};

export type CreateStructureAnalysisRunRequestBody = {
  buildRunId: string;
  heatmapSize: number;
};

export type AnalysisRunListQuerystring = {
  kind?: AnalysisRunKind;
  buildRunId?: string;
  limit?: number;
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
  request: CreatePairDivergenceAnalysisRunRequestBody;
};

export type ExposureAnalysisRunListItem = AnalysisRunBase & {
  kind: 'exposure';
  request: CreateExposureAnalysisRunRequestBody;
};

export type StructureAnalysisRunListItem = AnalysisRunBase & {
  kind: 'structure';
  request: CreateStructureAnalysisRunRequestBody;
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

const nullableDateTimeSchema = {
  anyOf: [
    { type: 'string', format: 'date-time' },
    { type: 'null' }
  ]
} as const;

const nullableStringSchema = {
  anyOf: [{ type: 'string' }, { type: 'null' }]
} as const;

const analysisRunBaseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    kind: { type: 'string', enum: [...ANALYSIS_RUN_KINDS] },
    buildRunId: { type: 'string' },
    status: { type: 'string', enum: [...ANALYSIS_RUN_STATUSES] },
    createdAt: { type: 'string', format: 'date-time' },
    startedAt: nullableDateTimeSchema,
    finishedAt: nullableDateTimeSchema,
    errorMessage: nullableStringSchema,
    request: {}
  },
  required: [
    'id',
    'kind',
    'buildRunId',
    'status',
    'createdAt',
    'startedAt',
    'finishedAt',
    'errorMessage',
    'request'
  ]
} as const;

export const analysisRunListItemSchema = analysisRunBaseSchema;

export const analysisRunDetailResponseSchema = {
  ...analysisRunBaseSchema,
  properties: {
    ...analysisRunBaseSchema.properties,
    result: {
      anyOf: [{}, { type: 'null' }]
    }
  },
  required: [...analysisRunBaseSchema.required, 'result']
} as const;

export const analysisRunListResponseSchema = {
  type: 'array',
  items: analysisRunListItemSchema
} as const;

export const analysisRunIdParamSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' }
  },
  required: ['id']
} as const;

export const analysisRunListQuerystringSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: [...ANALYSIS_RUN_KINDS] },
    buildRunId: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 50 }
  }
} as const;

export const createPairDivergenceAnalysisRunBodySchema = {
  type: 'object',
  properties: {
    buildRunId: { type: 'string' },
    recentWindowDays: { type: 'integer' },
    limit: { type: 'integer' },
    minLongCorrAbs: { type: 'number' },
    minCorrDeltaAbs: { type: 'number' }
  },
  required: ['buildRunId', 'recentWindowDays', 'limit', 'minLongCorrAbs', 'minCorrDeltaAbs'],
  additionalProperties: false
} as const;

export const createExposureAnalysisRunBodySchema = {
  type: 'object',
  properties: {
    buildRunId: { type: 'string' },
    symbol: { type: 'string' },
    k: { type: 'integer' }
  },
  required: ['buildRunId', 'symbol', 'k'],
  additionalProperties: false
} as const;

export const createStructureAnalysisRunBodySchema = {
  type: 'object',
  properties: {
    buildRunId: { type: 'string' },
    heatmapSize: { type: 'integer' }
  },
  required: ['buildRunId', 'heatmapSize'],
  additionalProperties: false
} as const;