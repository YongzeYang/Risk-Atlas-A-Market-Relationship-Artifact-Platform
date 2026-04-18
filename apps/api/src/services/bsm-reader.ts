import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRootDir = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const defaultQueryBinary = resolve(repoRootDir, 'cpp', 'build', 'bin', 'risk_atlas_bsm_query');

function resolveQueryBinaryPath(): string {
  const configured = process.env.BSM_QUERY_BIN;

  if (!configured) {
    return defaultQueryBinary;
  }

  return isAbsolute(configured) ? configured : resolve(repoRootDir, configured);
}

async function runBsmQuery(args: string[]): Promise<string> {
  const queryBinary = resolveQueryBinaryPath();

  try {
    await access(queryBinary, constants.X_OK);
  } catch {
    throw new Error(
      `BSM query binary is not executable: ${queryBinary}. ` +
        `Build it with: cmake -S cpp -B cpp/build && cmake --build cpp/build`
    );
  }

  return new Promise<string>((resolvePromise, rejectPromise) => {
    const child = spawn(queryBinary, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      rejectPromise(new Error(`Failed to start BSM query binary: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise(stdout.trim());
        return;
      }

      rejectPromise(
        new Error(
          `BSM query exited with code ${code}.` + (stderr ? ` stderr: ${stderr.trim()}` : '')
        )
      );
    });
  });
}

export type BsmMetadata = {
  dimension: number;
  blockSize: number;
};

export type BsmPairScoreResult = {
  row: number;
  col: number;
  score: number;
};

export type BsmRowTopkEntry = {
  index: number;
  score: number;
};

export type BsmSubmatrixResult = {
  indices: number[];
  scores: number[][];
};

export async function queryBsmMetadata(bsmPath: string): Promise<BsmMetadata> {
  const output = await runBsmQuery(['--file', bsmPath, '--command', 'metadata']);
  return JSON.parse(output) as BsmMetadata;
}

export async function queryBsmPairScore(
  bsmPath: string,
  row: number,
  col: number
): Promise<BsmPairScoreResult> {
  const output = await runBsmQuery([
    '--file',
    bsmPath,
    '--command',
    'pair-score',
    '--row',
    String(row),
    '--col',
    String(col)
  ]);
  return JSON.parse(output) as BsmPairScoreResult;
}

export async function queryBsmRowTopk(
  bsmPath: string,
  row: number,
  k: number
): Promise<BsmRowTopkEntry[]> {
  const output = await runBsmQuery([
    '--file',
    bsmPath,
    '--command',
    'row-topk',
    '--row',
    String(row),
    '--k',
    String(k)
  ]);
  return JSON.parse(output) as BsmRowTopkEntry[];
}

export async function queryBsmSubmatrix(
  bsmPath: string,
  indices: number[]
): Promise<BsmSubmatrixResult> {
  const output = await runBsmQuery([
    '--file',
    bsmPath,
    '--command',
    'submatrix',
    '--indices',
    indices.join(',')
  ]);
  return JSON.parse(output) as BsmSubmatrixResult;
}
