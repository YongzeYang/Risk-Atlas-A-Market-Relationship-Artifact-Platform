import 'dotenv/config';

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { Market, Prisma, SecurityType } from '@prisma/client';

import { prisma } from '../src/lib/prisma.js';
import { computeLogReturns } from '../src/services/correlation-analytics.js';
import { runBuild } from '../src/services/build-run-runner.js';
import { importEodCsv } from './import-eod.js';
import { MIN_REQUIRED_PRICE_ROWS } from './mvp-config.js';

const DATASET_ID = 'hk_eod_yahoo_real_v1';
const DATASET_NAME = 'Hong Kong EOD Real Yahoo Chart v1';
const UNIVERSE_300_ID = 'hk_real_yahoo_300';
const UNIVERSE_500_ID = 'hk_real_yahoo_500';
const OUTPUT_CSV_PATH = resolve(process.cwd(), '../../data/real-hk/hk_eod_yahoo_real_v1.csv');
const OUTPUT_SYMBOLS_PATH = resolve(process.cwd(), '../../data/real-hk/hk_eod_yahoo_real_v1.symbols.json');
const OUTPUT_REPORT_PATH = resolve(
  process.cwd(),
  `../../artifacts/benchmark-reports/hk-real-yahoo-benchmark-${new Date().toISOString().slice(0, 10)}.json`
);

const FETCH_START_DATE = '2024-01-01';
const FETCH_END_DATE = '2026-04-18';
const TARGET_SYMBOL_COUNT = 500;
const ACCEPTED_SYMBOL_TARGET = 650;
const SCAN_START_CODE = 1;
const SCAN_END_CODE = 9999;
const FETCH_BATCH_SIZE = 8;
const MAX_FETCH_ATTEMPTS = 3;
const ACTIVE_MIN_LAST_TRADE_DATE = '2026-04-01';
const NEAR_ZERO_VARIANCE_THRESHOLD = 1e-20;

type PricePoint = {
  tradeDate: string;
  adjClose: number;
  volume: bigint | null;
};

type SymbolHistory = {
  symbol: string;
  name: string;
  prices: PricePoint[];
  lastTradeDate: string;
};

type BenchmarkEntry = {
  universeId: string;
  requestedSymbolCount: number;
  buildRunId: string;
  status: string;
  durationMs: number | null;
  matrixByteSize: number | null;
  previewByteSize: number | null;
  manifestByteSize: number | null;
  minScore: number | null;
  maxScore: number | null;
  startedAt: string | null;
  finishedAt: string | null;
};

async function main() {
  console.log('Starting real HK benchmark fetch/import/build flow.');

  const selectedHistories = await loadOrFetchHistories();

  const importSummary = await importEodCsv({
    datasetId: DATASET_ID,
    datasetName: DATASET_NAME,
    csvPath: OUTPUT_CSV_PATH,
    replaceExisting: true,
    prismaClient: prisma,
    transactionTimeoutMs: 600_000
  });

  await upsertSecurityMaster(selectedHistories);
  const benchmarkSymbols = await selectBenchmarkEligibleSymbols(DATASET_ID, importSummary.maxTradeDate);
  if (benchmarkSymbols.length < TARGET_SYMBOL_COUNT) {
    throw new Error(
      `Only ${benchmarkSymbols.length} symbols passed the 252-day variance screen, below target ${TARGET_SYMBOL_COUNT}.`
    );
  }

  const selectedBySymbol = new Map(selectedHistories.map((entry) => [entry.symbol, entry] as const));
  const benchmarkHistories = benchmarkSymbols
    .map((symbol) => selectedBySymbol.get(symbol))
    .filter((entry): entry is SymbolHistory => entry !== undefined);

  await upsertStaticUniverse(UNIVERSE_300_ID, 'HK Real Yahoo 300', benchmarkHistories.slice(0, 300));
  await upsertStaticUniverse(UNIVERSE_500_ID, 'HK Real Yahoo 500', benchmarkHistories.slice(0, 500));

  const benchmarks = await runBenchmarks(importSummary.maxTradeDate);

  const report = {
    source: 'yahoo_chart_api',
    generatedAt: new Date().toISOString(),
    fetch: {
      startDate: FETCH_START_DATE,
      endDate: FETCH_END_DATE,
      scannedRange: [SCAN_START_CODE, SCAN_END_CODE],
      acceptedSymbolCount: selectedHistories.length,
      varianceEligibleSymbolCount: benchmarkHistories.length,
      csvPath: OUTPUT_CSV_PATH,
      symbolsPath: OUTPUT_SYMBOLS_PATH
    },
    dataset: importSummary,
    benchmarks,
    recommendation: buildRecommendation(benchmarks)
  };

  await mkdir(resolve(process.cwd(), '../../artifacts/benchmark-reports'), { recursive: true });
  await writeFile(OUTPUT_REPORT_PATH, JSON.stringify(report, null, 2));

  console.log('Benchmark complete.');
  console.log(JSON.stringify(report, null, 2));
  console.log(`Report written to ${OUTPUT_REPORT_PATH}`);
}

async function loadOrFetchHistories(): Promise<SymbolHistory[]> {
  if (existsSync(OUTPUT_CSV_PATH) && existsSync(OUTPUT_SYMBOLS_PATH)) {
    console.log(`Reusing cached real HK data from ${OUTPUT_CSV_PATH}.`);
    const cached = JSON.parse(await readFile(OUTPUT_SYMBOLS_PATH, 'utf8')) as Array<{
      symbol: string;
      name: string;
      lastTradeDate: string;
      rowCount: number;
    }>;

    if (cached.length >= ACCEPTED_SYMBOL_TARGET) {
      return cached.slice(0, ACCEPTED_SYMBOL_TARGET).map((entry) => ({
        symbol: entry.symbol,
        name: entry.name,
        lastTradeDate: entry.lastTradeDate,
        prices: []
      }));
    }
  }

  const histories = await fetchAcceptedSymbolHistories();
  if (histories.length < ACCEPTED_SYMBOL_TARGET) {
    throw new Error(
      `Only fetched ${histories.length} valid Hong Kong symbols, below target candidate pool ${ACCEPTED_SYMBOL_TARGET}.`
    );
  }

  const selectedHistories = histories.slice(0, ACCEPTED_SYMBOL_TARGET);
  await writeNormalizedCsv(selectedHistories, OUTPUT_CSV_PATH);
  await writeFile(
    OUTPUT_SYMBOLS_PATH,
    JSON.stringify(
      selectedHistories.map((entry) => ({
        symbol: entry.symbol,
        name: entry.name,
        lastTradeDate: entry.lastTradeDate,
        rowCount: entry.prices.length
      })),
      null,
      2
    )
  );

  return selectedHistories;
}

async function fetchAcceptedSymbolHistories(): Promise<SymbolHistory[]> {
  const accepted: SymbolHistory[] = [];
  let scanned = 0;

  for (let code = SCAN_START_CODE; code <= SCAN_END_CODE; code += FETCH_BATCH_SIZE) {
    const batchSymbols = Array.from({ length: FETCH_BATCH_SIZE }, (_, index) => code + index)
      .filter((candidate) => candidate <= SCAN_END_CODE)
      .map(toHkSymbol);

    const batchResults = await Promise.all(batchSymbols.map((symbol) => fetchSymbolHistory(symbol)));

    for (const result of batchResults) {
      scanned += 1;
      if (result) {
        accepted.push(result);
      }
    }

    if (accepted.length >= ACCEPTED_SYMBOL_TARGET) {
      break;
    }

    if (scanned % 200 === 0) {
      console.log(`Scanned ${scanned} symbols, accepted ${accepted.length}.`);
    }
  }

  accepted.sort((left, right) => left.symbol.localeCompare(right.symbol));
  return accepted;
}

async function fetchSymbolHistory(symbol: string): Promise<SymbolHistory | null> {
  const url = buildYahooChartUrl(symbol, FETCH_START_DATE, FETCH_END_DATE);

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'Mozilla/5.0 RiskAtlasBenchmark/1.0'
        }
      });

      if (response.status === 429) {
        await wait(300 * attempt);
        continue;
      }

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as YahooChartResponse;
      const result = payload.chart?.result?.[0];

      if (!result?.meta || result.meta.exchangeName !== 'HKG') {
        return null;
      }

      if (result.meta.instrumentType !== 'EQUITY') {
        return null;
      }

      const timestamps = result.timestamp ?? [];
      const adjCloses = result.indicators?.adjclose?.[0]?.adjclose ?? [];
      const volumes = result.indicators?.quote?.[0]?.volume ?? [];

      const prices: PricePoint[] = [];
      for (let index = 0; index < timestamps.length; index += 1) {
        const timestamp = timestamps[index];
        const adjClose = adjCloses[index];

        if (!timestamp || !Number.isFinite(adjClose) || (adjClose ?? 0) <= 0) {
          continue;
        }

        const volume = volumes[index];
        prices.push({
          tradeDate: new Date(timestamp * 1000).toISOString().slice(0, 10),
          adjClose: Number(adjClose),
          volume: Number.isFinite(volume) && (volume ?? 0) >= 0 ? BigInt(Math.round(volume!)) : null
        });
      }

      if (prices.length < MIN_REQUIRED_PRICE_ROWS) {
        return null;
      }

      const lastTradeDate = prices[prices.length - 1]?.tradeDate ?? null;
      if (!lastTradeDate || lastTradeDate < ACTIVE_MIN_LAST_TRADE_DATE) {
        return null;
      }

      return {
        symbol,
        name: result.meta.longName?.trim() || symbol,
        prices,
        lastTradeDate
      };
    } catch {
      await wait(200 * attempt);
    }
  }

  return null;
}

async function writeNormalizedCsv(histories: SymbolHistory[], outputPath: string): Promise<void> {
  await mkdir(resolve(outputPath, '..'), { recursive: true });

  const lines = ['tradeDate,symbol,adjClose,volume'];
  for (const history of histories) {
    for (const price of history.prices) {
      lines.push(
        [
          price.tradeDate,
          history.symbol,
          price.adjClose.toFixed(6),
          price.volume?.toString() ?? ''
        ].join(',')
      );
    }
  }

  await writeFile(outputPath, `${lines.join('\n')}\n`);
}

async function upsertSecurityMaster(histories: SymbolHistory[]): Promise<void> {
  for (const history of histories) {
    await prisma.securityMaster.upsert({
      where: { symbol: history.symbol },
      update: {
        name: history.name,
        shortName: null,
        securityType: SecurityType.common_equity,
        market: Market.HK
      },
      create: {
        symbol: history.symbol,
        name: history.name,
        shortName: null,
        securityType: SecurityType.common_equity,
        sector: null,
        market: Market.HK
      }
    });
  }
}

async function upsertStaticUniverse(
  universeId: string,
  universeName: string,
  histories: SymbolHistory[]
): Promise<void> {
  const symbols = histories.map((entry) => entry.symbol);

  await prisma.universe.upsert({
    where: { id: universeId },
    update: {
      name: universeName,
      market: Market.HK,
      symbolsJson: symbols as Prisma.InputJsonValue,
      symbolCount: symbols.length,
      definitionKind: 'static',
      definitionParams: Prisma.JsonNull
    },
    create: {
      id: universeId,
      name: universeName,
      market: Market.HK,
      symbolsJson: symbols as Prisma.InputJsonValue,
      symbolCount: symbols.length,
      definitionKind: 'static',
      definitionParams: Prisma.JsonNull
    }
  });
}

async function runBenchmarks(asOfDate: string): Promise<BenchmarkEntry[]> {
  const plans = [
    { universeId: UNIVERSE_300_ID, requestedSymbolCount: 300 },
    { universeId: UNIVERSE_500_ID, requestedSymbolCount: 500 }
  ];

  const entries: BenchmarkEntry[] = [];

  for (const plan of plans) {
    const buildRun = await prisma.buildRun.create({
      data: {
        datasetId: DATASET_ID,
        universeId: plan.universeId,
        asOfDate,
        windowDays: 252,
        scoreMethod: 'pearson_corr'
      }
    });

    const startedAt = performance.now();
    await runBuild(buildRun.id);
    const elapsedMs = Math.round(performance.now() - startedAt);

    const completed = await prisma.buildRun.findUnique({
      where: { id: buildRun.id },
      include: { artifact: true }
    });

    if (!completed) {
      throw new Error(`Build run ${buildRun.id} disappeared during benchmark.`);
    }

    entries.push({
      universeId: plan.universeId,
      requestedSymbolCount: plan.requestedSymbolCount,
      buildRunId: buildRun.id,
      status: completed.status,
      durationMs: completed.finishedAt && completed.startedAt
        ? completed.finishedAt.getTime() - completed.startedAt.getTime()
        : elapsedMs,
      matrixByteSize: completed.artifact?.matrixByteSize ? Number(completed.artifact.matrixByteSize) : null,
      previewByteSize: completed.artifact?.previewByteSize ? Number(completed.artifact.previewByteSize) : null,
      manifestByteSize: completed.artifact?.manifestByteSize ? Number(completed.artifact.manifestByteSize) : null,
      minScore: completed.artifact?.minScore ?? null,
      maxScore: completed.artifact?.maxScore ?? null,
      startedAt: completed.startedAt?.toISOString() ?? null,
      finishedAt: completed.finishedAt?.toISOString() ?? null
    });
  }

  return entries;
}

async function selectBenchmarkEligibleSymbols(
  datasetId: string,
  asOfDate: string
): Promise<string[]> {
  const rows = await prisma.eodPrice.findMany({
    where: {
      datasetId,
      tradeDate: {
        lte: asOfDate
      }
    },
    orderBy: [
      { symbol: 'asc' },
      { tradeDate: 'asc' }
    ],
    select: {
      symbol: true,
      adjClose: true
    }
  });

  const pricesBySymbol = new Map<string, number[]>();
  for (const row of rows) {
    const prices = pricesBySymbol.get(row.symbol) ?? [];
    prices.push(row.adjClose);
    pricesBySymbol.set(row.symbol, prices);
  }

  return [...pricesBySymbol.entries()]
    .filter(([, prices]) => prices.length >= MIN_REQUIRED_PRICE_ROWS)
    .filter(([, prices]) => hasSufficientReturnVariance(prices.slice(-MIN_REQUIRED_PRICE_ROWS)))
    .map(([symbol]) => symbol)
    .sort((left, right) => left.localeCompare(right));
}

function hasSufficientReturnVariance(prices: number[]): boolean {
  const returns = computeLogReturns(prices);
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => {
    const centered = value - mean;
    return sum + centered * centered;
  }, 0);

  return variance > NEAR_ZERO_VARIANCE_THRESHOLD;
}

function buildRecommendation(entries: BenchmarkEntry[]): string {
  const benchmark500 = entries.find((entry) => entry.requestedSymbolCount === 500);

  if (!benchmark500 || benchmark500.status !== 'succeeded') {
    return '500-name build did not succeed, so importer and universe-cap changes should wait until the failure is diagnosed.';
  }

  if ((benchmark500.durationMs ?? Number.POSITIVE_INFINITY) <= 20_000) {
    return '300 and 500-name builds succeeded. Importer adaptation is not required for Yahoo chart long-form CSV, and the current 500 cap is validated; raise the cap only after a second run on an even broader real universe.';
  }

  return '500-name build succeeded but latency is still material. Keep the importer as-is, keep the 500 cap for now, and optimize runtime before raising the cap.';
}

function buildYahooChartUrl(symbol: string, startDate: string, endDate: string): string {
  const period1 = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000);
  const period2 = Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000);

  return `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d&includeAdjustedClose=true&events=div%2Csplits`;
}

function toHkSymbol(code: number): string {
  return `${code.toString().padStart(4, '0')}.HK`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        exchangeName?: string;
        instrumentType?: string;
        longName?: string;
      };
      timestamp?: number[];
      indicators?: {
        adjclose?: Array<{
          adjclose?: Array<number | null>;
        }>;
        quote?: Array<{
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
};

main()
  .catch((error) => {
    console.error('Real HK benchmark failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });