import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type {
  AnalysisRunDetailResponse,
  AnalysisRunKind,
  AnalysisRunListItem,
  AnalysisRunStatus
} from '../contracts/analysis-runs.js';
import { resolveArtifactRootDir } from './local-artifact-store.js';

const ANALYSIS_RUNS_DIRNAME = 'analysis-runs';
const ANALYSIS_RUN_RECORD_FILENAME = 'record.json';

type AnalysisRunFilter = {
  kind?: AnalysisRunKind;
  buildRunId?: string;
  limit?: number;
  statuses?: AnalysisRunStatus[];
};

export function resolveAnalysisRunsRootDir(): string {
  return resolve(resolveArtifactRootDir(), ANALYSIS_RUNS_DIRNAME);
}

function resolveAnalysisRunDir(id: string): string {
  return resolve(resolveAnalysisRunsRootDir(), id);
}

function resolveAnalysisRunRecordPath(id: string): string {
  return resolve(resolveAnalysisRunDir(id), ANALYSIS_RUN_RECORD_FILENAME);
}

export async function writeAnalysisRunRecord(record: AnalysisRunDetailResponse): Promise<void> {
  const runDir = resolveAnalysisRunDir(record.id);
  await mkdir(runDir, { recursive: true });
  await writeFile(resolveAnalysisRunRecordPath(record.id), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

export async function readAnalysisRunRecord(
  id: string
): Promise<AnalysisRunDetailResponse | null> {
  try {
    const raw = await readFile(resolveAnalysisRunRecordPath(id), 'utf8');
    return JSON.parse(raw) as AnalysisRunDetailResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('ENOENT')) {
      return null;
    }

    throw error;
  }
}

export async function listAnalysisRunRecords(
  filter: AnalysisRunFilter = {}
): Promise<AnalysisRunListItem[]> {
  const rootDir = resolveAnalysisRunsRootDir();

  try {
    const entries = await readdir(rootDir, { withFileTypes: true });
    const records = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => readAnalysisRunRecord(entry.name))
    );

    return records
      .filter((record): record is AnalysisRunDetailResponse => record !== null)
      .filter((record) => (filter.kind ? record.kind === filter.kind : true))
      .filter((record) => (filter.buildRunId ? record.buildRunId === filter.buildRunId : true))
      .filter((record) =>
        filter.statuses && filter.statuses.length > 0
          ? filter.statuses.includes(record.status)
          : true
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, filter.limit ?? 20)
      .map(({ result: _result, ...item }) => item);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('ENOENT')) {
      return [];
    }

    throw error;
  }
}