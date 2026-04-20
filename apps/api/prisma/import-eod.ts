// apps/api/prisma/import-eod.ts
import 'dotenv/config';

import { createReadStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { Market } from '@prisma/client';

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

export type ImportEodCsvOptions = {
  datasetId: string;
  datasetName: string;
  csvPath: string;
  market?: ImportMarket;
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

async function readImportRows(csvPath: string, datasetId: string, market: ImportMarket) {
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

  const rows: ImportRow[] = [];
  const symbols = new Set<string>();
  const tradeDates = new Set<string>();

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

    rows.push(row);

    symbols.add(symbol);
    tradeDates.add(tradeDate);
    
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

export async function importEodCsv(options: ImportEodCsvOptions): Promise<ImportEodCsvSummary> {
  const client = options.prismaClient ?? prisma;
  const market = options.market ?? Market.HK;
  const replaceExisting = options.replaceExisting ?? true;
  const transactionTimeoutMs =
    options.transactionTimeoutMs ?? DEFAULT_IMPORT_TRANSACTION_TIMEOUT_MS;

  const { rows, symbolCount, minTradeDate, maxTradeDate, firstValidAsOfByWindowDays } = await readImportRows(
    options.csvPath,
    options.datasetId,
    market
  );

  const importedSummary = {
    rowCount: rows.length,
    symbolCount,
    minTradeDate,
    maxTradeDate,
    firstValidAsOfByWindowDays
  };

  await client.$transaction(
    async (tx: any) => {
      await tx.dataset.upsert({
        where: {
          id: options.datasetId
        },
        update: {
          name: options.datasetName,
          source: 'curated_csv',
          market,
          catalogSymbolCount: importedSummary.symbolCount,
          catalogPriceRowCount: BigInt(importedSummary.rowCount),
          catalogMinTradeDate: importedSummary.minTradeDate,
          catalogMaxTradeDate: importedSummary.maxTradeDate,
          catalogFirstValidAsOf60: importedSummary.firstValidAsOfByWindowDays['60'],
          catalogFirstValidAsOf120: importedSummary.firstValidAsOfByWindowDays['120'],
          catalogFirstValidAsOf252: importedSummary.firstValidAsOfByWindowDays['252']
        },
        create: {
          id: options.datasetId,
          name: options.datasetName,
          source: 'curated_csv',
          market,
          catalogSymbolCount: importedSummary.symbolCount,
          catalogPriceRowCount: BigInt(importedSummary.rowCount),
          catalogMinTradeDate: importedSummary.minTradeDate,
          catalogMaxTradeDate: importedSummary.maxTradeDate,
          catalogFirstValidAsOf60: importedSummary.firstValidAsOfByWindowDays['60'],
          catalogFirstValidAsOf120: importedSummary.firstValidAsOfByWindowDays['120'],
          catalogFirstValidAsOf252: importedSummary.firstValidAsOfByWindowDays['252']
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

      if (!replaceExisting) {
        const persistedSummary = await loadPersistedDatasetSummary(tx, options.datasetId);

        await tx.dataset.update({
          where: {
            id: options.datasetId
          },
          data: {
            catalogSymbolCount: persistedSummary.symbolCount,
            catalogPriceRowCount: BigInt(persistedSummary.rowCount),
            catalogMinTradeDate: persistedSummary.minTradeDate || null,
            catalogMaxTradeDate: persistedSummary.maxTradeDate || null,
            catalogFirstValidAsOf60: persistedSummary.firstValidAsOfByWindowDays['60'],
            catalogFirstValidAsOf120: persistedSummary.firstValidAsOfByWindowDays['120'],
            catalogFirstValidAsOf252: persistedSummary.firstValidAsOfByWindowDays['252']
          }
        });
      }
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
    rowCount: rows.length,
    symbolCount,
    minTradeDate,
    maxTradeDate,
    firstValidAsOfByWindowDays
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