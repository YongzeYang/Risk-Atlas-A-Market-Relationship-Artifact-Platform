import 'dotenv/config';

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { Market, Prisma, SecurityType } from '@prisma/client';

import { prisma } from '../src/lib/prisma.js';
import { runBuild } from '../src/services/build-run-runner.js';
import { importEodCsv } from './import-eod.js';

const DATASET_ID = 'crypto_usd_coinbase_daily_v1';
const DATASET_NAME = 'Crypto USD Daily Coinbase v1';
const UNIVERSE_ID = 'crypto_usd_top_10';
const UNIVERSE_NAME = 'Crypto USD Top 10';
const OUTPUT_ROOT_DIR = resolve(process.cwd(), '../../data/crypto');
const OUTPUT_CSV_PATH = resolve(OUTPUT_ROOT_DIR, `${DATASET_ID}.csv`);
const OUTPUT_SYMBOLS_PATH = resolve(OUTPUT_ROOT_DIR, `${DATASET_ID}.symbols.json`);
const FETCH_START_DATE = '2024-01-01';
const FETCH_END_DATE = new Date().toISOString().slice(0, 10);
const COINBASE_MAX_CANDLES = 300;
const COINBASE_GRANULARITY_SECONDS = 86_400;
const REQUEST_RETRY_LIMIT = 3;
const BUILD_WINDOW_DAYS = 252;
const BUILD_SCORE_METHOD = 'pearson_corr' as const;

const PRODUCT_CATALOG = [
  { symbol: 'BTC-USD', name: 'Bitcoin' },
  { symbol: 'ETH-USD', name: 'Ethereum' },
  { symbol: 'SOL-USD', name: 'Solana' },
  { symbol: 'XRP-USD', name: 'XRP' },
  { symbol: 'ADA-USD', name: 'Cardano' },
  { symbol: 'DOGE-USD', name: 'Dogecoin' },
  { symbol: 'LINK-USD', name: 'Chainlink' },
  { symbol: 'LTC-USD', name: 'Litecoin' },
  { symbol: 'BCH-USD', name: 'Bitcoin Cash' },
  { symbol: 'AVAX-USD', name: 'Avalanche' }
] as const;

type CoinbaseCandle = [
  time: number,
  low: number,
  high: number,
  open: number,
  close: number,
  volume: number
];

type CsvRow = {
  tradeDate: string;
  symbol: string;
  adjClose: number;
  volume: bigint | null;
};

type ProductHistory = {
  symbol: string;
  name: string;
  rows: CsvRow[];
};

async function main() {
  await mkdir(OUTPUT_ROOT_DIR, { recursive: true });

  const histories = await Promise.all(
    PRODUCT_CATALOG.map(async (product) => fetchProductHistory(product.symbol, product.name))
  );

  const insufficientHistory = histories.filter(
    (history) => history.rows.length < BUILD_WINDOW_DAYS + 1
  );

  if (insufficientHistory.length > 0) {
    throw new Error(
      `Coinbase returned insufficient daily history for: ${insufficientHistory
        .map((entry) => `${entry.symbol}(${entry.rows.length})`)
        .join(', ')}`
    );
  }

  const csvRows = histories.flatMap((history) => history.rows);
  await writeNormalizedCsv(csvRows, OUTPUT_CSV_PATH);
  await writeFile(
    OUTPUT_SYMBOLS_PATH,
    `${JSON.stringify(histories.map((history) => history.symbol), null, 2)}\n`,
    'utf8'
  );

  for (const history of histories) {
    await prisma.securityMaster.upsert({
      where: { symbol: history.symbol },
      update: {
        name: history.name,
        shortName: history.name,
        securityType: SecurityType.crypto_asset,
        sector: null,
        market: Market.CRYPTO
      },
      create: {
        symbol: history.symbol,
        name: history.name,
        shortName: history.name,
        securityType: SecurityType.crypto_asset,
        sector: null,
        market: Market.CRYPTO
      }
    });
  }

  await prisma.universe.upsert({
    where: { id: UNIVERSE_ID },
    update: {
      name: UNIVERSE_NAME,
      market: Market.CRYPTO,
      symbolsJson: histories.map((history) => history.symbol) as Prisma.InputJsonValue,
      symbolCount: histories.length,
      definitionKind: 'static',
      definitionParams: Prisma.JsonNull
    },
    create: {
      id: UNIVERSE_ID,
      name: UNIVERSE_NAME,
      market: Market.CRYPTO,
      symbolsJson: histories.map((history) => history.symbol) as Prisma.InputJsonValue,
      symbolCount: histories.length,
      definitionKind: 'static',
      definitionParams: Prisma.JsonNull
    }
  });

  const importSummary = await importEodCsv({
    datasetId: DATASET_ID,
    datasetName: DATASET_NAME,
    csvPath: OUTPUT_CSV_PATH,
    market: Market.CRYPTO,
    replaceExisting: true,
    prismaClient: prisma,
    transactionTimeoutMs: 900_000
  });

  const buildRun = await prisma.buildRun.create({
    data: {
      datasetId: DATASET_ID,
      universeId: UNIVERSE_ID,
      asOfDate: importSummary.maxTradeDate,
      windowDays: BUILD_WINDOW_DAYS,
      scoreMethod: BUILD_SCORE_METHOD
    }
  });

  await runBuild(buildRun.id);

  const completedBuild = await prisma.buildRun.findUnique({
    where: { id: buildRun.id },
    include: { artifact: true }
  });

  if (!completedBuild || completedBuild.status !== 'succeeded' || !completedBuild.artifact) {
    throw new Error(
      `Crypto build ${buildRun.id} did not succeed: ${completedBuild?.errorMessage ?? 'unknown error'}`
    );
  }

  console.log(
    JSON.stringify(
      {
        datasetId: DATASET_ID,
        datasetName: DATASET_NAME,
        universeId: UNIVERSE_ID,
        symbolCount: histories.length,
        rowCount: importSummary.rowCount,
        minTradeDate: importSummary.minTradeDate,
        maxTradeDate: importSummary.maxTradeDate,
        buildRunId: buildRun.id,
        buildStatus: completedBuild.status,
        artifact: {
          symbolCount: completedBuild.artifact.symbolCount,
          minScore: completedBuild.artifact.minScore,
          maxScore: completedBuild.artifact.maxScore,
          matrixByteSize: completedBuild.artifact.matrixByteSize?.toString() ?? null,
          previewByteSize: completedBuild.artifact.previewByteSize?.toString() ?? null,
          manifestByteSize: completedBuild.artifact.manifestByteSize?.toString() ?? null
        },
        products: histories.map((history) => ({
          symbol: history.symbol,
          name: history.name,
          rows: history.rows.length,
          firstTradeDate: history.rows[0]?.tradeDate ?? null,
          lastTradeDate: history.rows[history.rows.length - 1]?.tradeDate ?? null
        })),
        output: {
          csvPath: OUTPUT_CSV_PATH,
          symbolsPath: OUTPUT_SYMBOLS_PATH
        }
      },
      null,
      2
    )
  );
}

async function fetchProductHistory(symbol: string, name: string): Promise<ProductHistory> {
  const candles = await fetchAllCoinbaseCandles(symbol, FETCH_START_DATE, FETCH_END_DATE);
  const rows = candles.map((candle) => ({
    tradeDate: new Date(candle[0] * 1000).toISOString().slice(0, 10),
    symbol,
    adjClose: candle[4],
    volume: Number.isFinite(candle[5]) ? BigInt(Math.round(candle[5])) : null
  }));

  rows.sort((left, right) => left.tradeDate.localeCompare(right.tradeDate));

  return {
    symbol,
    name,
    rows: dedupeRowsByTradeDate(rows)
  };
}

async function fetchAllCoinbaseCandles(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<CoinbaseCandle[]> {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const collected = new Map<number, CoinbaseCandle>();

  for (let cursor = start.getTime(); cursor <= end.getTime(); ) {
    const rangeStart = new Date(cursor);
    const rangeEnd = new Date(
      Math.min(
        cursor + (COINBASE_MAX_CANDLES - 1) * COINBASE_GRANULARITY_SECONDS * 1000,
        end.getTime()
      )
    );
    const requestEndExclusive = new Date(rangeEnd.getTime() + COINBASE_GRANULARITY_SECONDS * 1000);
    const candles = await fetchCoinbaseCandleRange(symbol, rangeStart, requestEndExclusive);

    for (const candle of candles) {
      collected.set(candle[0], candle);
    }

    cursor = rangeEnd.getTime() + COINBASE_GRANULARITY_SECONDS * 1000;
  }

  return [...collected.values()].sort((left, right) => left[0] - right[0]);
}

async function fetchCoinbaseCandleRange(
  symbol: string,
  start: Date,
  end: Date
): Promise<CoinbaseCandle[]> {
  const url = new URL(`https://api.exchange.coinbase.com/products/${symbol}/candles`);
  url.searchParams.set('granularity', String(COINBASE_GRANULARITY_SECONDS));
  url.searchParams.set('start', start.toISOString());
  url.searchParams.set('end', end.toISOString());

  for (let attempt = 1; attempt <= REQUEST_RETRY_LIMIT; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'RiskAtlasCryptoImporter/1.0'
      }
    });

    if (response.ok) {
      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload)) {
        throw new Error(`Unexpected Coinbase payload for ${symbol}.`);
      }

      return payload.filter(isCoinbaseCandle);
    }

    if (attempt === REQUEST_RETRY_LIMIT) {
      const responseText = await response.text();
      throw new Error(
        `Coinbase candles request failed for ${symbol} with ${response.status}: ${responseText}`
      );
    }

    await sleep(attempt * 1_000);
  }

  return [];
}

function isCoinbaseCandle(value: unknown): value is CoinbaseCandle {
  return (
    Array.isArray(value) &&
    value.length >= 6 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

function dedupeRowsByTradeDate(rows: CsvRow[]): CsvRow[] {
  const byTradeDate = new Map<string, CsvRow>();

  for (const row of rows) {
    byTradeDate.set(row.tradeDate, row);
  }

  return [...byTradeDate.values()].sort((left, right) => left.tradeDate.localeCompare(right.tradeDate));
}

async function writeNormalizedCsv(rows: CsvRow[], outputPath: string): Promise<void> {
  const lines = ['tradeDate,symbol,adjClose,volume'];

  for (const row of [...rows].sort((left, right) => {
    const symbolCompare = left.symbol.localeCompare(right.symbol);
    if (symbolCompare !== 0) {
      return symbolCompare;
    }

    return left.tradeDate.localeCompare(right.tradeDate);
  })) {
    lines.push(
      [
        row.tradeDate,
        row.symbol,
        row.adjClose.toFixed(8),
        row.volume?.toString() ?? ''
      ].join(',')
    );
  }

  await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

main()
  .catch((error) => {
    console.error('Crypto Coinbase import failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });