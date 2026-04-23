// apps/api/prisma/import-eod.ts
import 'dotenv/config';

import { createReadStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { Market, Prisma } from '@prisma/client';

import { prisma } from '../src/lib/prisma.js';

import { DEFAULT_DEMO_CSV_PATH } from './generate-sample-eod.js';
import {
  DEMO_DATASET_ID,
  DEMO_DATASET_NAME,
  HK_SYMBOL_PATTERN,
  ISO_DATE_PATTERN
} from './mvp-config.js';
type ImportMarket = Market | 'CRYPTO';

const CSV_HEADER_V1 = 'tradeDate,symbol,adjClose';
const CSV_HEADER_V2 = 'tradeDate,symbol,adjClose,volume';
const BATCH_SIZE = 5000;
const DEFAULT_IMPORT_TRANSACTION_TIMEOUT_MS = 300_000;
const PROGRESS_LOG_EVERY_ROWS = 100_000;
const WINDOW_DAYS = [60, 120, 252] as const;
const GENERIC_SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{1,31}$/;

const SYMBOL_PATTERN_BY_MARKET: Record<ImportMarket, RegExp> = {
  HK: HK_SYMBOL_PATTERN,
  CRYPTO: GENERIC_SYMBOL_PATTERN
};

const SYMBOL_FORMAT_HINT_BY_MARKET: Record<ImportMarket, string> = {
  HK: 'zero-padded format like 0700.HK',
  CRYPTO: 'uppercase product format like BTC-USD'
};

type WindowDays = (typeof WINDOW_DAYS)[number];
type FirstValidAsOfByWindowDays = Record<`${WindowDays}`, string | null>;

type ImportRow = {
  datasetId: string;
  tradeDate: string;
  symbol: string;
  adjClose: number;
  volume?: bigint;
};

type ImportProcessedSummary = Pick<
  ImportEodCsvSummary,
  'rowCount' | 'symbolCount' | 'minTradeDate' | 'maxTradeDate' | 'firstValidAsOfByWindowDays'
>;

export const IMPORT_EOD_CSV_MODES = ['replace', 'merge'] as const;
export type ImportEodCsvMode = (typeof IMPORT_EOD_CSV_MODES)[number];

export type ImportEodCsvOptions = {
  datasetId: string;
  datasetName: string;
  csvPath: string;
  market?: ImportMarket;
  importMode?: ImportEodCsvMode;
  replaceExisting?: boolean;
  prismaClient?: typeof prisma;
  transactionTimeoutMs?: number;
};

export type ImportEodCsvSummary = {
  datasetId: string;
  datasetName: string;
  csvPath: string;
  rowCount: number;
  symbolCount: number;
  minTradeDate: string;
  maxTradeDate: string;
  firstValidAsOfByWindowDays: FirstValidAsOfByWindowDays;
};

function buildFirstValidAsOfByWindowDays(tradeDates: Iterable<string>): FirstValidAsOfByWindowDays {
  const sortedTradeDates = [...new Set(tradeDates)].sort((left, right) => left.localeCompare(right));

  return {
    '60': sortedTradeDates[60] ?? null,
    '120': sortedTradeDates[120] ?? null,
    '252': sortedTradeDates[252] ?? null
  };
}

function parseCsvLine(line: string, lineNumber: number, columnCount: number): string[] {
  const parts = line.split(',');

  if (parts.length !== columnCount) {
    throw new Error(`Invalid CSV format at line ${lineNumber}. Expected exactly ${columnCount} columns.`);
  }

  return parts.map((p) => p.trim());
}

function validateImportRow(
  row: Omit<ImportRow, 'datasetId'>,
  lineNumber: number,
  market: ImportMarket
) {
  if (!ISO_DATE_PATTERN.test(row.tradeDate)) {
    throw new Error(
      `Invalid tradeDate "${row.tradeDate}" at line ${lineNumber}. Expected YYYY-MM-DD.`
    );
  }

  if (!SYMBOL_PATTERN_BY_MARKET[market].test(row.symbol)) {
    throw new Error(
      `Invalid symbol "${row.symbol}" at line ${lineNumber} for market ${market}. ` +
        `Expected ${SYMBOL_FORMAT_HINT_BY_MARKET[market]}.`
    );
  }

  if (!Number.isFinite(row.adjClose) || row.adjClose <= 0) {
    throw new Error(`Invalid adjClose "${row.adjClose}" at line ${lineNumber}.`);
  }
}

function buildDatasetCatalogData(summary: ImportProcessedSummary) {
  return {
    catalogSymbolCount: summary.symbolCount,
    catalogPriceRowCount: BigInt(summary.rowCount),
    catalogMinTradeDate: summary.minTradeDate,
    catalogMaxTradeDate: summary.maxTradeDate,
    catalogFirstValidAsOf60: summary.firstValidAsOfByWindowDays['60'],
    catalogFirstValidAsOf120: summary.firstValidAsOfByWindowDays['120'],
    catalogFirstValidAsOf252: summary.firstValidAsOfByWindowDays['252']
  };
}

async function streamImportRows(
  csvPath: string,
  datasetId: string,
  market: ImportMarket,
  onBatch: (batch: ImportRow[]) => Promise<void>
): Promise<ImportProcessedSummary> {
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
  let columnCount = 3;
  let hasVolume = false;

  let rowCount = 0;
  let batch: ImportRow[] = [];
  let flushedRowCount = 0;
  let nextProgressLogAt = PROGRESS_LOG_EVERY_ROWS;
  const symbols = new Set<string>();
  const tradeDates = new Set<string>();

  let minTradeDate: string | null = null;
  let maxTradeDate: string | null = null;

  async function flushBatch() {
    if (batch.length === 0) {
      return;
    }

    const currentBatch = batch;
    batch = [];
    await onBatch(currentBatch);
    flushedRowCount += currentBatch.length;

    if (flushedRowCount >= nextProgressLogAt) {
      console.log(
        `CSV import progress for ${datasetId}: ${flushedRowCount.toLocaleString('en-US')} rows inserted so far.`
      );

      while (nextProgressLogAt <= flushedRowCount) {
        nextProgressLogAt += PROGRESS_LOG_EVERY_ROWS;
      }
    }
  }

  for await (const rawLine of rl) {
    lineNumber += 1;
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (!seenHeader) {
      const normalizedHeader = line.replace(/^\uFEFF/, '');
      if (normalizedHeader === CSV_HEADER_V2) {
        columnCount = 4;
        hasVolume = true;
      } else if (normalizedHeader === CSV_HEADER_V1) {
        columnCount = 3;
        hasVolume = false;
      } else {
        throw new Error(
          `Invalid CSV header. Expected "${CSV_HEADER_V1}" or "${CSV_HEADER_V2}", got "${normalizedHeader}".`
        );
      }
      seenHeader = true;
      continue;
    }

    const parts = parseCsvLine(line, lineNumber, columnCount);
    const tradeDate = parts[0]!;
    const symbol = parts[1]!.toUpperCase();
    const adjClose = Number(parts[2]!);

    validateImportRow({ tradeDate, symbol, adjClose }, lineNumber, market);

    const row: ImportRow = {
      datasetId,
      tradeDate,
      symbol,
      adjClose
    };

    if (hasVolume && parts[3]) {
      const volumeNum = Number(parts[3]);
      if (!Number.isFinite(volumeNum) || volumeNum < 0) {
        throw new Error(`Invalid volume "${parts[3]}" at line ${lineNumber}.`);
      }
      row.volume = BigInt(Math.round(volumeNum));
    }

    batch.push(row);
    rowCount += 1;

    symbols.add(symbol);
    tradeDates.add(tradeDate);
    
    if (minTradeDate === null || tradeDate < minTradeDate) {
      minTradeDate = tradeDate;
    }
    if (maxTradeDate === null || tradeDate > maxTradeDate) {
      maxTradeDate = tradeDate;
    }

    if (batch.length >= BATCH_SIZE) {
      await flushBatch();
    }
  }

  await flushBatch();

  if (!seenHeader) {
    throw new Error('CSV is empty or missing a header row.');
  }

  if (rowCount === 0 || minTradeDate === null || maxTradeDate === null) {
    throw new Error('CSV contains no data rows.');
  }

  return {
    rowCount,
    symbolCount: symbols.size,
    minTradeDate,
    maxTradeDate,
    firstValidAsOfByWindowDays: buildFirstValidAsOfByWindowDays(tradeDates)
  };
}

async function loadPersistedDatasetSummary(tx: any, datasetId: string): Promise<Pick<ImportEodCsvSummary, 'rowCount' | 'symbolCount' | 'minTradeDate' | 'maxTradeDate' | 'firstValidAsOfByWindowDays'>> {
  const [statsRow] = await tx.$queryRaw<
    Array<{
      priceRowCount: bigint | number;
      symbolCount: bigint | number;
      minTradeDate: string | null;
      maxTradeDate: string | null;
    }>
  >`
    SELECT
      COUNT(*)::bigint AS "priceRowCount",
      COUNT(DISTINCT "symbol")::bigint AS "symbolCount",
      MIN("tradeDate") AS "minTradeDate",
      MAX("tradeDate") AS "maxTradeDate"
    FROM "eod_prices"
    WHERE "datasetId" = ${datasetId}
  `;

  const [firstValidRow] = await tx.$queryRaw<
    Array<{
      asOf60: string | null;
      asOf120: string | null;
      asOf252: string | null;
    }>
  >`
    WITH distinct_trade_dates AS (
      SELECT DISTINCT "tradeDate"
      FROM "eod_prices"
      WHERE "datasetId" = ${datasetId}
    ),
    ranked_trade_dates AS (
      SELECT
        "tradeDate",
        ROW_NUMBER() OVER (ORDER BY "tradeDate" ASC) AS rn
      FROM distinct_trade_dates
    )
    SELECT
      MAX(CASE WHEN rn = 61 THEN "tradeDate" END) AS "asOf60",
      MAX(CASE WHEN rn = 121 THEN "tradeDate" END) AS "asOf120",
      MAX(CASE WHEN rn = 253 THEN "tradeDate" END) AS "asOf252"
    FROM ranked_trade_dates
    WHERE rn IN (61, 121, 253)
  `;

  return {
    rowCount: Number(statsRow?.priceRowCount ?? 0),
    symbolCount: Number(statsRow?.symbolCount ?? 0),
    minTradeDate: statsRow?.minTradeDate ?? '',
    maxTradeDate: statsRow?.maxTradeDate ?? '',
    firstValidAsOfByWindowDays: {
      '60': firstValidRow?.asOf60 ?? null,
      '120': firstValidRow?.asOf120 ?? null,
      '252': firstValidRow?.asOf252 ?? null
    }
  };
}

function resolveImportMode(options: ImportEodCsvOptions): ImportEodCsvMode {
  if (options.importMode) {
    return options.importMode;
  }

  if (options.replaceExisting === undefined) {
    return 'replace';
  }

  return options.replaceExisting ? 'replace' : 'merge';
}

function dedupeImportBatch(batch: ImportRow[]): ImportRow[] {
  const rowsByNaturalKey = new Map<string, ImportRow>();

  for (const row of batch) {
    rowsByNaturalKey.set(`${row.datasetId}\u0000${row.symbol}\u0000${row.tradeDate}`, row);
  }

  return [...rowsByNaturalKey.values()];
}

async function upsertImportBatch(tx: any, batch: ImportRow[]): Promise<void> {
  const dedupedBatch = dedupeImportBatch(batch);

  if (dedupedBatch.length === 0) {
    return;
  }

  const values = Prisma.join(
    dedupedBatch.map((row) =>
      Prisma.sql`(${row.datasetId}, ${row.tradeDate}, ${row.symbol}, ${row.adjClose}, ${row.volume ?? null})`
    )
  );

  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "eod_prices" (
      "datasetId",
      "tradeDate",
      "symbol",
      "adjClose",
      "volume"
    )
    VALUES ${values}
    ON CONFLICT ("datasetId", "symbol", "tradeDate")
    DO UPDATE SET
      "adjClose" = EXCLUDED."adjClose",
      "volume" = EXCLUDED."volume"
  `);
}

export async function importEodCsv(options: ImportEodCsvOptions): Promise<ImportEodCsvSummary> {
  const client = options.prismaClient ?? prisma;
  const market = options.market ?? Market.HK;
  const importMode = resolveImportMode(options);
  const transactionTimeoutMs =
    options.transactionTimeoutMs ?? DEFAULT_IMPORT_TRANSACTION_TIMEOUT_MS;

  console.log(
    `Starting CSV import for dataset ${options.datasetId} from ${options.csvPath} ` +
      `(mode=${importMode}, batch size ${BATCH_SIZE.toLocaleString('en-US')}).`
  );

  const finalSummary = await client.$transaction(
    async (tx: any): Promise<ImportProcessedSummary> => {
      await tx.dataset.upsert({
        where: {
          id: options.datasetId
        },
        update: {
          name: options.datasetName,
          source: 'curated_csv',
          market
        },
        create: {
          id: options.datasetId,
          name: options.datasetName,
          source: 'curated_csv',
          market
        }
      });

      if (importMode === 'replace') {
        await tx.eodPrice.deleteMany({
          where: {
            datasetId: options.datasetId
          }
        });
      }

      const importedSummary = await streamImportRows(
        options.csvPath,
        options.datasetId,
        market,
        async (batch) => {
          await upsertImportBatch(tx, batch);
        }
      );

      const persistedSummary = await loadPersistedDatasetSummary(tx, options.datasetId);

      if (importMode === 'merge') {
        console.log(
          `Merged ${importedSummary.rowCount.toLocaleString('en-US')} CSV rows into dataset ${options.datasetId}; ` +
            `persisted dataset now has ${persistedSummary.rowCount.toLocaleString('en-US')} rows.`
        );
      }

      await tx.dataset.update({
        where: {
          id: options.datasetId
        },
        data: buildDatasetCatalogData(persistedSummary)
      });

      return persistedSummary;
    },
    {
      timeout: transactionTimeoutMs,
      maxWait: 30_000
    }
  );

  return {
    datasetId: options.datasetId,
    datasetName: options.datasetName,
    csvPath: options.csvPath,
    rowCount: finalSummary.rowCount,
    symbolCount: finalSummary.symbolCount,
    minTradeDate: finalSummary.minTradeDate,
    maxTradeDate: finalSummary.maxTradeDate,
    firstValidAsOfByWindowDays: finalSummary.firstValidAsOfByWindowDays
  };
}

async function main() {
  const csvPathArg = process.argv[2];
  const csvPath = csvPathArg ? resolve(process.cwd(), csvPathArg) : DEFAULT_DEMO_CSV_PATH;

  const summary = await importEodCsv({
    datasetId: DEMO_DATASET_ID,
    datasetName: DEMO_DATASET_NAME,
    csvPath,
    market: Market.HK,
    importMode: 'replace',
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