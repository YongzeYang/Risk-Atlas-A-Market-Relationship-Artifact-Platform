import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { constants } from 'node:fs';
import { access, readFile, rm } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BuildRunScoreMethod } from '../contracts/build-runs.js';

const repoRootDir = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const defaultWriterBinary = resolve(repoRootDir, 'cpp', 'build', 'bin', 'risk_atlas_bsm_writer');
const defaultIncrementalBuilderBinary = resolve(
  repoRootDir,
  'cpp',
  'build',
  'bin',
  'risk_atlas_bsm_incremental_builder'
);
const MATRIX_SYMMETRY_TOLERANCE = 1e-8;
const INCREMENTAL_PROGRESS_VERSION = 1 as const;

export type WriteBsmMatrixArtifactOptions = {
  outputPath: string;
  symbols: string[];
  scores: number[][];
  blockSize?: number;
  maxCachedBlocks?: number;
};

export type IncrementalBsmBuildMetadata = {
  buildRunId: string;
  symbolSetHash: string;
  asOfDate: string;
  scoreMethod: BuildRunScoreMethod;
  windowDays: number;
  sourceDatasetMaxTradeDate: string | null;
  symbolCount: number;
};

type IncrementalBsmBuildProgress = IncrementalBsmBuildMetadata & {
  version: typeof INCREMENTAL_PROGRESS_VERSION;
  nextRow: number;
};

export type IncrementalBsmResumeState = {
  startRow: number;
  resumed: boolean;
  resetReason: string | null;
};

export type IncrementalBsmMatrixArtifactWriter = {
  startRow: number;
  appendLowerRow(rowIndex: number, lowerRow: number[]): Promise<void>;
  finish(): Promise<void>;
  abort(): void;
};

function resolveWriterBinaryPath(): string {
  const configured = process.env.BSM_WRITER_BIN;

  if (!configured) {
    return defaultWriterBinary;
  }

  return isAbsolute(configured) ? configured : resolve(repoRootDir, configured);
}

function resolveIncrementalBuilderBinaryPath(): string {
  const configured = process.env.BSM_INCREMENTAL_BUILDER_BIN;

  if (!configured) {
    return defaultIncrementalBuilderBinary;
  }

  return isAbsolute(configured) ? configured : resolve(repoRootDir, configured);
}

function validateSymbols(symbols: string[]): void {
  if (symbols.length === 0) {
    throw new Error('Cannot write .bsm artifact for an empty symbol list.');
  }

  const seenSymbols = new Set<string>();
  for (let i = 0; i < symbols.length; i += 1) {
    const symbol = symbols[i];
    if (!symbol || symbol.trim().length === 0) {
      throw new Error(`Encountered empty symbol at index ${i}.`);
    }

    if (seenSymbols.has(symbol)) {
      throw new Error(`Duplicate symbol in input payload: ${symbol}`);
    }

    seenSymbols.add(symbol);
  }
}

function validateDenseMatrix(symbols: string[], scores: number[][]): void {
  validateSymbols(symbols);

  if (scores.length !== symbols.length) {
    throw new Error('Dense score matrix row count does not match symbol count.');
  }

  for (let i = 0; i < scores.length; i += 1) {
    const row = scores[i];

    if (row.length !== symbols.length) {
      throw new Error(`Dense score matrix row ${i} has incorrect column count.`);
    }

    for (let j = 0; j < row.length; j += 1) {
      const value = row[j];
      if (!Number.isFinite(value)) {
        throw new Error(`Dense score matrix contains non-finite value at [${i}, ${j}].`);
      }

      if (j > i) {
        const mirrored = scores[j]?.[i];
        if (mirrored === undefined) {
          throw new Error(`Dense score matrix is missing mirrored value at [${j}, ${i}].`);
        }

        if (!Number.isFinite(mirrored)) {
          throw new Error(`Dense score matrix contains non-finite value at [${j}, ${i}].`);
        }

        if (Math.abs(value - mirrored) > MATRIX_SYMMETRY_TOLERANCE) {
          throw new Error(
            `Dense score matrix is not symmetric within tolerance at [${i}, ${j}] and [${j}, ${i}].`
          );
        }
      }
    }
  }
}

function formatFloat64(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toPrecision(17);
}

async function writeChunk(stream: NodeJS.WritableStream, chunk: string): Promise<void> {
  if (stream.write(chunk, 'utf8')) {
    return;
  }

  await once(stream, 'drain');
}

async function streamWriterInput(
  stream: NodeJS.WritableStream,
  symbols: string[],
  scores: number[][]
): Promise<void> {
  await streamIncrementalWriterHeader(stream, symbols);

  for (let i = 0; i < scores.length; i += 1) {
    const row = scores[i]!;
    const lowerValues = Array<string>(i + 1);

    for (let j = 0; j <= i; j += 1) {
      lowerValues[j] = formatFloat64(row[j]!);
    }

    await writeChunk(stream, `${lowerValues.join(' ')}\n`);
  }

  stream.end();
}

async function streamIncrementalWriterHeader(
  stream: NodeJS.WritableStream,
  symbols: string[]
): Promise<void> {
  await writeChunk(stream, `${symbols.length}\n`);

  for (const symbol of symbols) {
    await writeChunk(stream, `${symbol}\n`);
  }
}

function deriveBlockSize(symbolCount: number): number {
  return Math.min(16, Math.max(4, symbolCount));
}

function deriveCacheBlocks(): number {
  return 8;
}

function validateLowerRow(symbolCount: number, rowIndex: number, lowerRow: number[]): void {
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= symbolCount) {
    throw new Error(`Lower-row index ${rowIndex} is out of range.`);
  }

  if (lowerRow.length !== rowIndex + 1) {
    throw new Error(
      `Lower-row payload length mismatch for row ${rowIndex}: expected ${rowIndex + 1}, got ${lowerRow.length}.`
    );
  }

  for (let columnIndex = 0; columnIndex < lowerRow.length; columnIndex += 1) {
    const value = lowerRow[columnIndex];
    if (!Number.isFinite(value)) {
      throw new Error(
        `Lower-row payload contains non-finite value at [${rowIndex}, ${columnIndex}].`
      );
    }
  }
}

function parseKeyValueText(text: string): Map<string, string> {
  const values = new Map<string, string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      throw new Error(`Malformed incremental build progress line: ${line}`);
    }

    values.set(line.slice(0, separatorIndex), line.slice(separatorIndex + 1));
  }

  return values;
}

async function readIncrementalBsmBuildProgress(
  progressPath: string
): Promise<IncrementalBsmBuildProgress | null> {
  try {
    const raw = await readFile(progressPath, 'utf8');
    const values = parseKeyValueText(raw);
    const versionText = values.get('version');

    if (versionText !== String(INCREMENTAL_PROGRESS_VERSION)) {
      throw new Error(`Unsupported incremental build progress version at ${progressPath}.`);
    }

    const buildRunId = values.get('build_run_id');
    const symbolSetHash = values.get('symbol_set_hash');
    const asOfDate = values.get('as_of_date');
    const scoreMethod = values.get('score_method');
    const windowDaysText = values.get('window_days');
    const symbolCountText = values.get('symbol_count');
    const nextRowText = values.get('next_row');

    if (
      !buildRunId ||
      !symbolSetHash ||
      !asOfDate ||
      !scoreMethod ||
      !windowDaysText ||
      !symbolCountText ||
      !nextRowText
    ) {
      throw new Error(`Incremental build progress file is missing required fields at ${progressPath}.`);
    }

    const windowDays = Number.parseInt(windowDaysText, 10);
    const symbolCount = Number.parseInt(symbolCountText, 10);
    const nextRow = Number.parseInt(nextRowText, 10);

    if (!Number.isInteger(windowDays) || windowDays <= 0) {
      throw new Error(`Invalid window_days value in incremental build progress at ${progressPath}.`);
    }

    if (!Number.isInteger(symbolCount) || symbolCount <= 0) {
      throw new Error(`Invalid symbol_count value in incremental build progress at ${progressPath}.`);
    }

    if (!Number.isInteger(nextRow) || nextRow < 0) {
      throw new Error(`Invalid next_row value in incremental build progress at ${progressPath}.`);
    }

    return {
      version: INCREMENTAL_PROGRESS_VERSION,
      buildRunId,
      symbolSetHash,
      asOfDate,
      scoreMethod: scoreMethod as BuildRunScoreMethod,
      windowDays,
      sourceDatasetMaxTradeDate: values.get('source_dataset_max_trade_date') || null,
      symbolCount,
      nextRow
    };
  } catch (error) {
    const typedError = error as NodeJS.ErrnoException;
    if (typedError?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function validateIncrementalProgress(
  progress: IncrementalBsmBuildProgress,
  metadata: IncrementalBsmBuildMetadata
): void {
  if (progress.buildRunId !== metadata.buildRunId) {
    throw new Error('Incremental build progress buildRunId does not match the current build run.');
  }

  if (progress.symbolSetHash !== metadata.symbolSetHash) {
    throw new Error('Incremental build progress symbolSetHash does not match the current symbol set.');
  }

  if (progress.asOfDate !== metadata.asOfDate) {
    throw new Error('Incremental build progress asOfDate does not match the current build inputs.');
  }

  if (progress.scoreMethod !== metadata.scoreMethod) {
    throw new Error('Incremental build progress scoreMethod does not match the current build inputs.');
  }

  if (progress.windowDays !== metadata.windowDays) {
    throw new Error('Incremental build progress windowDays does not match the current build inputs.');
  }

  if ((progress.sourceDatasetMaxTradeDate ?? null) !== (metadata.sourceDatasetMaxTradeDate ?? null)) {
    throw new Error(
      'Incremental build progress sourceDatasetMaxTradeDate does not match the current dataset state.'
    );
  }

  if (progress.symbolCount !== metadata.symbolCount) {
    throw new Error('Incremental build progress symbolCount does not match the current build inputs.');
  }

  if (progress.nextRow > metadata.symbolCount) {
    throw new Error('Incremental build progress nextRow exceeds the current matrix dimension.');
  }
}

export async function resolveIncrementalBsmResumeState(args: {
  progressPath: string;
  metadata: IncrementalBsmBuildMetadata;
  allowResume: boolean;
}): Promise<IncrementalBsmResumeState> {
  if (!args.allowResume) {
    return {
      startRow: 0,
      resumed: false,
      resetReason: null
    };
  }

  try {
    const progress = await readIncrementalBsmBuildProgress(args.progressPath);
    if (!progress) {
      return {
        startRow: 0,
        resumed: false,
        resetReason: null
      };
    }

    validateIncrementalProgress(progress, args.metadata);

    return {
      startRow: progress.nextRow,
      resumed: progress.nextRow > 0,
      resetReason: null
    };
  } catch (error) {
    return {
      startRow: 0,
      resumed: false,
      resetReason: error instanceof Error ? error.message : 'Invalid incremental build progress state.'
    };
  }
}

export async function clearIncrementalBsmBuildProgress(progressPath: string): Promise<void> {
  await rm(progressPath, { force: true });
}

export async function openIncrementalBsmMatrixArtifactWriter(options: {
  outputPath: string;
  progressPath: string;
  symbols: string[];
  metadata: IncrementalBsmBuildMetadata;
  startRow: number;
  seedFromPath?: string;
  seedRows?: number;
  blockSize?: number;
  maxCachedBlocks?: number;
}): Promise<IncrementalBsmMatrixArtifactWriter> {
  validateSymbols(options.symbols);

  if (!Number.isInteger(options.startRow) || options.startRow < 0 || options.startRow > options.symbols.length) {
    throw new Error(`Invalid incremental builder startRow ${options.startRow}.`);
  }

  const builderBinary = resolveIncrementalBuilderBinaryPath();

  try {
    await access(builderBinary, constants.X_OK);
  } catch {
    throw new Error(
      `BSM incremental builder binary is not executable: ${builderBinary}. ` +
        `Make sure the bsm submodule is initialized ` +
        `(git submodule update --init --recursive) and then build the C++ targets with ` +
        `cmake -S cpp -B cpp/build && cmake --build cpp/build.`
    );
  }

  const blockSize = options.blockSize ?? deriveBlockSize(options.symbols.length);
  const maxCachedBlocks = options.maxCachedBlocks ?? deriveCacheBlocks();
  const seedRows = options.seedRows ?? 0;

  if (!Number.isInteger(seedRows) || seedRows < 0 || seedRows > options.symbols.length) {
    throw new Error(`Invalid incremental builder seedRows ${seedRows}.`);
  }

  if (seedRows > 0 && options.startRow !== 0) {
    throw new Error('Incremental builder seedRows can only be used when startRow is 0.');
  }

  if (seedRows > 0 && !options.seedFromPath) {
    throw new Error('Incremental builder seedFromPath is required when seedRows > 0.');
  }

  const streamStartRow = Math.max(options.startRow, seedRows);

  const child = spawn(
    builderBinary,
    [
      '--output',
      options.outputPath,
      '--progress',
      options.progressPath,
      '--build-run-id',
      options.metadata.buildRunId,
      '--symbol-set-hash',
      options.metadata.symbolSetHash,
      '--as-of-date',
      options.metadata.asOfDate,
      '--score-method',
      options.metadata.scoreMethod,
      '--window-days',
      String(options.metadata.windowDays),
      '--source-dataset-max-trade-date',
      options.metadata.sourceDatasetMaxTradeDate ?? '',
      '--start-row',
      String(options.startRow),
      ...(seedRows > 0 && options.seedFromPath
        ? ['--seed-from', options.seedFromPath, '--seed-rows', String(seedRows)]
        : []),
      '--block-size',
      String(blockSize),
      '--cache-blocks',
      String(maxCachedBlocks)
    ],
    {
      stdio: ['pipe', 'ignore', 'pipe']
    }
  );

  let stderr = '';
  let settled = false;
  let nextRow = streamStartRow;

  const completionPromise = new Promise<void>((resolvePromise, rejectPromise) => {
    const fail = (error: Error): void => {
      if (settled) {
        return;
      }

      settled = true;
      rejectPromise(error);
    };

    const succeed = (): void => {
      if (settled) {
        return;
      }

      settled = true;
      resolvePromise();
    };

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EPIPE') {
        fail(
          new Error(
            `BSM incremental builder closed stdin unexpectedly (EPIPE).` +
              (stderr ? ` stderr: ${stderr.trim()}` : '')
          )
        );
        return;
      }

      fail(
        new Error(
          `Failed while streaming matrix payload to BSM incremental builder: ${error.message}` +
            (stderr ? ` stderr: ${stderr.trim()}` : '')
        )
      );
    });

    child.on('error', (error) => {
      fail(
        new Error(
          `Failed to start BSM incremental builder "${builderBinary}": ${error.message}`
        )
      );
    });

    child.on('close', (code) => {
      if (settled) {
        return;
      }

      if (code === 0) {
        succeed();
        return;
      }

      fail(
        new Error(
          `BSM incremental builder exited with code ${code}.` +
            (stderr ? ` stderr: ${stderr.trim()}` : '')
        )
      );
    });
  });

  const headerPromise = streamIncrementalWriterHeader(child.stdin, options.symbols);

  return {
    startRow: streamStartRow,
    async appendLowerRow(rowIndex, lowerRow) {
      if (rowIndex !== nextRow) {
        throw new Error(
          `Incremental BSM builder expected row ${nextRow}, received row ${rowIndex}.`
        );
      }

      validateLowerRow(options.symbols.length, rowIndex, lowerRow);
      await headerPromise;
      await writeChunk(
        child.stdin,
        `${lowerRow.map((value) => formatFloat64(value)).join(' ')}\n`
      );
      nextRow += 1;
    },
    async finish() {
      await headerPromise;
      child.stdin.end();
      await completionPromise;
    },
    abort() {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }
  };
}

export async function writeBsmMatrixArtifact(
  options: WriteBsmMatrixArtifactOptions
): Promise<void> {
  validateDenseMatrix(options.symbols, options.scores);

  const writerBinary = resolveWriterBinaryPath();

  try {
    await access(writerBinary, constants.X_OK);
  } catch {
    throw new Error(
      `BSM writer binary is not executable: ${writerBinary}. ` +
        `Make sure the bsm submodule is initialized ` +
        `(git submodule update --init --recursive) and then build the writer with ` +
        `cmake -S cpp -B cpp/build && cmake --build cpp/build.`
    );
  }

  const blockSize = options.blockSize ?? deriveBlockSize(options.symbols.length);
  const maxCachedBlocks = options.maxCachedBlocks ?? deriveCacheBlocks();

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(
      writerBinary,
      [
        '--output',
        options.outputPath,
        '--block-size',
        String(blockSize),
        '--cache-blocks',
        String(maxCachedBlocks)
      ],
      {
        stdio: ['pipe', 'ignore', 'pipe']
      }
    );

    let stderr = '';
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }

      settled = true;
      rejectPromise(error);
    };

    const succeed = (): void => {
      if (settled) {
        return;
      }

      settled = true;
      resolvePromise();
    };

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EPIPE') {
        fail(
          new Error(
            `BSM writer binary closed stdin unexpectedly (EPIPE).` +
              (stderr ? ` stderr: ${stderr.trim()}` : '')
          )
        );
        return;
      }

      fail(
        new Error(
          `Failed while streaming matrix payload to BSM writer binary: ${error.message}` +
            (stderr ? ` stderr: ${stderr.trim()}` : '')
        )
      );
    });

    child.on('error', (error) => {
      fail(
        new Error(`Failed to start BSM writer binary "${writerBinary}": ${error.message}`)
      );
    });

    child.on('close', (code) => {
      if (settled) {
        return;
      }

      if (code === 0) {
        succeed();
        return;
      }

      fail(
        new Error(
          `BSM writer binary exited with code ${code}.` +
            (stderr ? ` stderr: ${stderr.trim()}` : '')
        )
      );
    });

    void streamWriterInput(child.stdin, options.symbols, options.scores).catch((error) => {
      fail(
        error instanceof Error
          ? error
          : new Error(
              `Unexpected error while streaming matrix payload to BSM writer binary: ${String(error)}`
            )
      );
    });
  });
}