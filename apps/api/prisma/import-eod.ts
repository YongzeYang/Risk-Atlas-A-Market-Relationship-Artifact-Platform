// apps/api/prisma/import-eod.ts
import 'dotenv/config';

import { createReadStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { prisma } from '../src/lib/prisma.js';

import { DEFAULT_DEMO_CSV_PATH } from './generate-sample-eod.js';
import {
  DEMO_DATASET_ID,
  DEMO_DATASET_NAME,
  HK_SYMBOL_PATTERN,
  ISO_DATE_PATTERN
} from './mvp-config.js';

const CSV_HEADER = 'tradeDate,symbol,adjClose';
const BATCH_SIZE = 1000;

type ImportRow = {
  datasetId: string;
  tradeDate: string;
  symbol: string;
  adjClose: number;
};

export type ImportEodCsvOptions = {
  datasetId: string;
  datasetName: string;
  csvPath: string;
  replaceExisting?: boolean;
  prismaClient?: typeof prisma;
};

export type ImportEodCsvSummary = {
  datasetId: string;
  datasetName: string;
  csvPath: string;
  rowCount: number;
  symbolCount: number;
  minTradeDate: string;
  maxTradeDate: string;
};

function parseCsvLine(line: string, lineNumber: number): [string, string, string] {
  const parts = line.split(',');

  if (parts.length !== 3) {
    throw new Error(`Invalid CSV format at line ${lineNumber}. Expected exactly 3 columns.`);
  }

  return [parts[0]!.trim(), parts[1]!.trim().toUpperCase(), parts[2]!.trim()];
}

function validateImportRow(row: Omit<ImportRow, 'datasetId'>, lineNumber: number) {
  if (!ISO_DATE_PATTERN.test(row.tradeDate)) {
    throw new Error(
      `Invalid tradeDate "${row.tradeDate}" at line ${lineNumber}. Expected YYYY-MM-DD.`
    );
  }

  if (!HK_SYMBOL_PATTERN.test(row.symbol)) {
    throw new Error(
      `Invalid symbol "${row.symbol}" at line ${lineNumber}. Expected zero-padded format like 0700.HK.`
    );
  }

  if (!Number.isFinite(row.adjClose) || row.adjClose <= 0) {
    throw new Error(`Invalid adjClose "${row.adjClose}" at line ${lineNumber}.`);
  }
}

async function readImportRows(csvPath: string, datasetId: string) {
  if (!existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const input = createReadStream(csvPath, { encoding: 'utf8' });
  const rl = createInterface({
    input,
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  let seenHeader = false;

  const rows: ImportRow[] = [];
  const symbols = new Set<string>();

  let minTradeDate: string | null = null;
  let maxTradeDate: string | null = null;

  for await (const rawLine of rl) {
    lineNumber += 1;
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (!seenHeader) {
      const normalizedHeader = line.replace(/^\uFEFF/, '');
      if (normalizedHeader !== CSV_HEADER) {
        throw new Error(
          `Invalid CSV header. Expected "${CSV_HEADER}", got "${normalizedHeader}".`
        );
      }
      seenHeader = true;
      continue;
    }

    const [tradeDate, symbol, adjCloseRaw] = parseCsvLine(line, lineNumber);
    const adjClose = Number(adjCloseRaw);

    validateImportRow({ tradeDate, symbol, adjClose }, lineNumber);

    rows.push({
      datasetId,
      tradeDate,
      symbol,
      adjClose
    });

    symbols.add(symbol);
    
    if (minTradeDate === null || tradeDate < minTradeDate) {
      minTradeDate = tradeDate;
    }
    if (maxTradeDate === null || tradeDate > maxTradeDate) {
      maxTradeDate = tradeDate;
    }
  }

  if (!seenHeader) {
    throw new Error('CSV is empty or missing a header row.');
  }

  if (rows.length === 0 || minTradeDate === null || maxTradeDate === null) {
    throw new Error('CSV contains no data rows.');
  }

  return {
    rows,
    symbolCount: symbols.size,
    minTradeDate,
    maxTradeDate
  };
}

export async function importEodCsv(options: ImportEodCsvOptions): Promise<ImportEodCsvSummary> {
  const client = options.prismaClient ?? prisma;
  const replaceExisting = options.replaceExisting ?? true;

  const { rows, symbolCount, minTradeDate, maxTradeDate } = await readImportRows(
    options.csvPath,
    options.datasetId
  );

  await client.$transaction(async (tx: any) => {
    await tx.dataset.upsert({
      where: {
        id: options.datasetId
      },
      update: {
        name: options.datasetName,
        source: 'curated_csv',
        market: 'HK'
      },
      create: {
        id: options.datasetId,
        name: options.datasetName,
        source: 'curated_csv',
        market: 'HK'
      }
    });

    if (replaceExisting) {
      await tx.eodPrice.deleteMany({
        where: {
          datasetId: options.datasetId
        }
      });
    }

    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const batch = rows.slice(offset, offset + BATCH_SIZE);
      await tx.eodPrice.createMany({
        data: batch
      });
    }
  });

  return {
    datasetId: options.datasetId,
    datasetName: options.datasetName,
    csvPath: options.csvPath,
    rowCount: rows.length,
    symbolCount,
    minTradeDate,
    maxTradeDate
  };
}

async function main() {
  const csvPathArg = process.argv[2];
  const csvPath = csvPathArg ? resolve(process.cwd(), csvPathArg) : DEFAULT_DEMO_CSV_PATH;

  const summary = await importEodCsv({
    datasetId: DEMO_DATASET_ID,
    datasetName: DEMO_DATASET_NAME,
    csvPath,
    replaceExisting: true,
    prismaClient: prisma
  });

  console.log(
    `Imported dataset ${summary.datasetId} from ${summary.csvPath}: ` +
      `${summary.rowCount} rows, ${summary.symbolCount} symbols, ` +
      `${summary.minTradeDate}..${summary.maxTradeDate}.`
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main()
    .catch((error) => {
      console.error('Import failed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}