import type {
  AnalysisRunDetailResponse,
  PairDivergenceAnalysisRunDetailResponse,
  ExposureAnalysisRunDetailResponse,
  StructureAnalysisRunDetailResponse
} from '../contracts/analysis-runs.js';
import { getBuildRunExposure } from './exposure-service.js';
import { getBuildRunPairDivergence } from './pair-divergence-service.js';
import { getBuildRunStructure } from './structure-service.js';
import {
  listAnalysisRunRecords,
  readAnalysisRunRecord,
  writeAnalysisRunRecord
} from './analysis-run-store.js';

const queuedOrRunningAnalysisRunIds = new Set<string>();

export function scheduleAnalysisRun(analysisRunId: string): void {
  if (queuedOrRunningAnalysisRunIds.has(analysisRunId)) {
    return;
  }

  queuedOrRunningAnalysisRunIds.add(analysisRunId);

  setImmediate(() => {
    void runAnalysisRunInternal(analysisRunId);
  });
}

export async function resumePendingAnalysisRuns(): Promise<void> {
  const pendingRuns = await listAnalysisRunRecords({
    statuses: ['pending', 'running'],
    limit: 500
  });

  for (const run of pendingRuns) {
    scheduleAnalysisRun(run.id);
  }
}

async function runAnalysisRunInternal(analysisRunId: string): Promise<void> {
  try {
    const existing = await readAnalysisRunRecord(analysisRunId);
    if (!existing || existing.status === 'succeeded' || existing.status === 'failed') {
      return;
    }

    const runningRecord: AnalysisRunDetailResponse = {
      ...existing,
      status: 'running',
      startedAt: existing.startedAt ?? new Date().toISOString(),
      finishedAt: null,
      errorMessage: null
    };
    await writeAnalysisRunRecord(runningRecord);

    const completed = await runAnalysisRecord(runningRecord);
    await writeAnalysisRunRecord({
      ...completed,
      status: 'succeeded',
      finishedAt: new Date().toISOString(),
      errorMessage: null
    });
  } catch (error) {
    const existing = await readAnalysisRunRecord(analysisRunId);
    if (existing) {
      await writeAnalysisRunRecord({
        ...existing,
        status: 'failed',
        finishedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : 'Analysis run failed.',
        result: null
      });
    }

    console.error(`[analysis-run:${analysisRunId}] failed`, error);
  } finally {
    queuedOrRunningAnalysisRunIds.delete(analysisRunId);
  }
}

async function runAnalysisRecord(
  record: AnalysisRunDetailResponse
): Promise<AnalysisRunDetailResponse> {
  switch (record.kind) {
    case 'pair_divergence': {
      const result = await getBuildRunPairDivergence(record.buildRunId, {
        recentWindowDays: record.request.recentWindowDays,
        limit: record.request.limit,
        minLongCorrAbs: record.request.minLongCorrAbs,
        minCorrDeltaAbs: record.request.minCorrDeltaAbs
      });

      return {
        ...(record as PairDivergenceAnalysisRunDetailResponse),
        result
      };
    }

    case 'exposure': {
      const result = await getBuildRunExposure(record.buildRunId, {
        symbol: record.request.symbol,
        k: record.request.k
      });

      return {
        ...(record as ExposureAnalysisRunDetailResponse),
        result
      };
    }

    case 'structure': {
      const result = await getBuildRunStructure(record.buildRunId, {
        heatmapSize: record.request.heatmapSize
      });

      return {
        ...(record as StructureAnalysisRunDetailResponse),
        result
      };
    }

    default:
      throw new Error(`Unsupported analysis run kind: ${(record as AnalysisRunDetailResponse).kind}`);
  }
}