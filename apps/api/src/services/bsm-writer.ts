import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRootDir = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const defaultWriterBinary = resolve(repoRootDir, 'cpp', 'build', 'bin', 'risk_atlas_bsm_writer');

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
    }
  }
}

function formatFloat64(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toPrecision(17);
}

function buildWriterInputPayload(symbols: string[], scores: number[][]): string {
  const lines: string[] = [String(symbols.length), ...symbols];

  for (const row of scores) {
    lines.push(row.map(formatFloat64).join(' '));
  }

  return `${lines.join('\n')}\n`;
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

  const payload = buildWriterInputPayload(options.symbols, options.scores);
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

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      rejectPromise(
        new Error(`Failed to start BSM writer binary "${writerBinary}": ${error.message}`)
      );
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `BSM writer binary exited with code ${code}.` +
            (stderr ? ` stderr: ${stderr.trim()}` : '')
        )
      );
    });

    child.stdin.end(payload, 'utf8');
  });
}