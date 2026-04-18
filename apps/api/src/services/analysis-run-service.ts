import { randomUUID } from 'node:crypto';

import { prisma } from '../lib/prisma.js';
import { ServiceError } from '../lib/service-error.js';
import type {
  AnalysisRunDetailResponse,
  AnalysisRunListItem,
  AnalysisRunListQuerystring,
  CreateExposureAnalysisRunRequestBody,
  CreatePairDivergenceAnalysisRunRequestBody,
  CreateStructureAnalysisRunRequestBody,
  ExposureAnalysisRunDetailResponse,
  ExposureAnalysisRunListItem,
  PairDivergenceAnalysisRunDetailResponse,
  PairDivergenceAnalysisRunListItem,
  StructureAnalysisRunDetailResponse,
  StructureAnalysisRunListItem
} from '../contracts/analysis-runs.js';
import {
  listAnalysisRunRecords,
  readAnalysisRunRecord,
  writeAnalysisRunRecord
} from './analysis-run-store.js';
import { scheduleAnalysisRun } from './analysis-run-runner.js';

export async function createPairDivergenceAnalysisRun(
  request: CreatePairDivergenceAnalysisRunRequestBody
): Promise<PairDivergenceAnalysisRunListItem> {
  await ensureBuildRunExists(request.buildRunId);

  const record: PairDivergenceAnalysisRunDetailResponse = {
    id: randomUUID(),
    kind: 'pair_divergence',
    buildRunId: request.buildRunId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    errorMessage: null,
    request,
    result: null
  };

  await writeAnalysisRunRecord(record);
  scheduleAnalysisRun(record.id);

  const { result: _result, ...item } = record;
  return item;
}

export async function createExposureAnalysisRun(
  request: CreateExposureAnalysisRunRequestBody
): Promise<ExposureAnalysisRunListItem> {
  await ensureBuildRunExists(request.buildRunId);

  const record: ExposureAnalysisRunDetailResponse = {
    id: randomUUID(),
    kind: 'exposure',
    buildRunId: request.buildRunId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    errorMessage: null,
    request,
    result: null
  };

  await writeAnalysisRunRecord(record);
  scheduleAnalysisRun(record.id);

  const { result: _result, ...item } = record;
  return item;
}

export async function createStructureAnalysisRun(
  request: CreateStructureAnalysisRunRequestBody
): Promise<StructureAnalysisRunListItem> {
  await ensureBuildRunExists(request.buildRunId);

  const record: StructureAnalysisRunDetailResponse = {
    id: randomUUID(),
    kind: 'structure',
    buildRunId: request.buildRunId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    errorMessage: null,
    request,
    result: null
  };

  await writeAnalysisRunRecord(record);
  scheduleAnalysisRun(record.id);

  const { result: _result, ...item } = record;
  return item;
}

export async function getAnalysisRun(id: string): Promise<AnalysisRunDetailResponse | null> {
  return readAnalysisRunRecord(id);
}

export async function listAnalysisRuns(
  query: AnalysisRunListQuerystring
): Promise<AnalysisRunListItem[]> {
  return listAnalysisRunRecords({
    kind: query.kind,
    buildRunId: query.buildRunId,
    limit: query.limit ?? 20
  });
}

async function ensureBuildRunExists(buildRunId: string): Promise<void> {
  const buildRun = await prisma.buildRun.findUnique({
    where: {
      id: buildRunId
    },
    select: {
      id: true
    }
  });

  if (!buildRun) {
    throw new ServiceError(404, `Build run "${buildRunId}" was not found.`);
  }
}