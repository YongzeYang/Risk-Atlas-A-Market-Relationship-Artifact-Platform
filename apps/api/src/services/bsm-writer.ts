import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRootDir = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const defaultWriterBinary = resolve(repoRootDir, 'cpp', 'build', 'bin', 'risk_atlas_bsm_writer');
const MATRIX_SYMMETRY_TOLERANCE = 1e-8;

export type WriteBsmMatrixArtifactOptions = {
  outputPath: string;
  symbols: string[];
  scores: number[][];
  blockSize?: number;
  maxCachedBlocks?: number;
};

function resolveWriterBinaryPath(): string {
  const configured = process.env.BSM_WRITER_BIN;

  if (!configured) {
    return defaultWriterBinary;
  }

  return isAbsolute(configured) ? configured : resolve(repoRootDir, configured);
}

function validateDenseMatrix(symbols: string[], scores: number[][]): void {
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
  await writeChunk(stream, `${symbols.length}\n`);

  for (const symbol of symbols) {
    await writeChunk(stream, `${symbol}\n`);
  }

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

function deriveBlockSize(symbolCount: number): number {
  return Math.min(16, Math.max(4, symbolCount));
}

function deriveCacheBlocks(): number {
  return 8;
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