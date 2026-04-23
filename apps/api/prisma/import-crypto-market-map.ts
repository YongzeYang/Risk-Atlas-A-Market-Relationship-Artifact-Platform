import 'dotenv/config';

import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { Market, Prisma, Sector, SecurityType } from '@prisma/client';

import { prisma } from '../src/lib/prisma.js';
import { runBuild } from '../src/services/build-run-runner.js';
import { importEodCsv } from './import-eod.js';

const DATASET_ID = 'crypto_market_map_yahoo_v2';
const DATASET_NAME = 'Crypto Market Map Yahoo v2';
const OUTPUT_ROOT_DIR = resolve(process.cwd(), '../../data/crypto');
const OUTPUT_CSV_PATH = resolve(OUTPUT_ROOT_DIR, `${DATASET_ID}.csv`);
const OUTPUT_SYMBOLS_PATH = resolve(OUTPUT_ROOT_DIR, `${DATASET_ID}.symbols.json`);
const OUTPUT_TAXONOMY_PATH = resolve(OUTPUT_ROOT_DIR, `${DATASET_ID}.taxonomy.json`);
const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';
const YAHOO_CHART_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const DEFAULT_CANDIDATE_PAGE_COUNT = 5;
const MARKETS_PER_PAGE = 250;
const TARGET_ASSET_COUNT = parsePositiveInteger(
  process.env.CRYPTO_MARKET_MAP_TARGET_COUNT,
  DEFAULT_CANDIDATE_PAGE_COUNT * MARKETS_PER_PAGE
);
const MIN_ASSET_COUNT = parsePositiveInteger(
  process.env.CRYPTO_MARKET_MAP_MIN_COUNT,
  50
);
const CANDIDATE_PAGE_COUNT = parsePositiveInteger(
  process.env.CRYPTO_MARKET_MAP_CANDIDATE_PAGE_COUNT,
  DEFAULT_CANDIDATE_PAGE_COUNT
);
const HISTORY_DAYS = 365;
const COINGECKO_REQUEST_DELAY_MS = parsePositiveInteger(
  process.env.CRYPTO_MARKET_MAP_REQUEST_DELAY_MS,
  350
);
const HISTORY_FETCH_CONCURRENCY = parsePositiveInteger(
  process.env.CRYPTO_MARKET_MAP_HISTORY_CONCURRENCY,
  10
);
const HISTORY_FETCH_BATCH_SIZE = parsePositiveInteger(
  process.env.CRYPTO_MARKET_MAP_HISTORY_BATCH_SIZE,
  Math.max(TARGET_ASSET_COUNT, 40)
);
const ENABLE_DETAIL_ENRICHMENT =
  (process.env.CRYPTO_MARKET_MAP_ENRICH_DETAILS ?? '0').trim() === '1';
const MAX_REQUEST_RETRIES = 5;
const LIQUIDITY_ADV_DAYS = 30;
const BUILD_WINDOW_DAYS = 252;
const MIN_REQUIRED_HISTORY_ROWS = BUILD_WINDOW_DAYS + 1;
const BUILD_SCORE_METHOD = 'pearson_corr' as const;
const SKIP_VERIFICATION_BUILD =
  (process.env.CRYPTO_MARKET_MAP_SKIP_VERIFICATION_BUILD ?? '0').trim() === '1';
const IMPORT_MODE =
  (process.env.RISK_ATLAS_IMPORT_EOD_MODE ?? 'replace').trim() === 'merge' ? 'merge' : 'replace';
const SOURCE_REFRESH_OVERLAP_DAYS = parsePositiveInteger(
  process.env.RISK_ATLAS_CRYPTO_SOURCE_REFRESH_OVERLAP_DAYS,
  45
);
const MIN_SECTOR_UNIVERSE_SIZE = 5;
const PROGRESS_LOG_EVERY = parsePositiveInteger(
  process.env.CRYPTO_MARKET_MAP_PROGRESS_EVERY,
  TARGET_ASSET_COUNT >= 500 ? 100 : 5
);

const KNOWN_STABLE_SYMBOLS = new Set([
  'USD1',
  'USDT',
  'USDC',
  'DAI',
  'FDUSD',
  'TUSD',
  'USDE',
  'USDS',
  'USDD',
  'PYUSD',
  'USDP',
  'EURC',
  'EURS',
  'GUSD',
  'LUSD',
  'RLUSD',
  'CRVUSD'
]);

const KNOWN_WRAPPED_OR_LST_SYMBOLS = new Set([
  'WBTC',
  'WETH',
  'CBETH',
  'STETH',
  'WSTETH',
  'RETH',
  'WEETH',
  'EZETH',
  'JITOSOL',
  'MSOL',
  'WSOL'
]);

const STATIC_UNIVERSE_DEFINITIONS = [
  {
    id: 'crypto_market_map_all',
    name: 'Crypto Market Map All'
  },
  {
    id: 'crypto_market_cap_50',
    name: 'Crypto Market Cap Top 50',
    take: 50
  },
  {
    id: 'crypto_market_cap_100',
    name: 'Crypto Market Cap Top 100',
    take: 100
  },
  {
    id: 'crypto_market_cap_200',
    name: 'Crypto Market Cap Top 200',
    take: 200
  }
] as const;

const DYNAMIC_LIQUIDITY_UNIVERSES = [
  {
    id: 'crypto_top_50_liquid',
    name: 'Crypto Top 50 Liquid',
    topN: 50
  },
  {
    id: 'crypto_top_100_liquid',
    name: 'Crypto Top 100 Liquid',
    topN: 100
  },
  {
    id: 'crypto_top_200_liquid',
    name: 'Crypto Top 200 Liquid',
    topN: 200
  }
] as const;

const BUILD_UNIVERSE_ID = 'crypto_market_map_all';

type CoinGeckoMarketEntry = {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank: number | null;
  market_cap: number | null;
  total_volume: number | null;
  current_price: number | null;
};

type CoinGeckoCoinDetail = {
  id: string;
  symbol: string;
  name: string;
  categories?: string[];
};

type CoinGeckoMarketChart = {
  prices?: number[][];
  total_volumes?: number[][];
};

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        adjclose?: Array<{
          adjclose?: Array<number | null>;
        }>;
        quote?: Array<{
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      code?: string;
      description?: string;
    } | null;
  };
};

type CsvRow = {
  tradeDate: string;
  symbol: string;
  adjClose: number;
  volume: bigint | null;
};

type SelectedAsset = {
  coinId: string;
  historySymbol: string;
  symbol: string;
  rawSymbol: string;
  name: string;
  marketCapRank: number;
  marketCapUsd: number | null;
  currentVolumeUsd: number | null;
  sector: Sector | null;
  categories: string[];
  rows: CsvRow[];
};

type CachedSelectedAsset = {
  coinId: string;
  historySymbol: string;
  symbol: string;
  rawSymbol: string;
  name: string;
  sector: Sector | null;
  categories: string[];
  rows: CsvRow[];
  lastTradeDate: string;
};

type CachedSelectedAssetSnapshot = {
  symbol: string;
  rawSymbol: string;
  coinId: string;
  historySymbol: string;
  name: string;
  sector: Sector | null;
  categories: string[];
  rowCount?: number;
  firstTradeDate?: string | null;
  lastTradeDate?: string | null;
};

type HistoryFetchResult = {
  market: CoinGeckoMarketEntry;
  historySymbol: string | null;
  rows: CsvRow[];
  errorMessage: string | null;
};

let lastCoinGeckoRequestStartedAt = 0;

async function main() {
  const startedAt = Date.now();
  const estimatedCoinGeckoRequests =
    CANDIDATE_PAGE_COUNT + (ENABLE_DETAIL_ENRICHMENT ? TARGET_ASSET_COUNT : 0);
  const cachedSelectedAssets = await loadCachedSelectedAssets(OUTPUT_TAXONOMY_PATH, OUTPUT_CSV_PATH);

  console.log(
    `Starting crypto market-map import for target=${TARGET_ASSET_COUNT}, ` +
      `candidatePages=${CANDIDATE_PAGE_COUNT}, historyDays=${HISTORY_DAYS}, ` +
      `coingeckoRequestDelayMs=${COINGECKO_REQUEST_DELAY_MS}, ` +
      `historyBatchSize=${HISTORY_FETCH_BATCH_SIZE}, historyConcurrency=${HISTORY_FETCH_CONCURRENCY}, ` +
      `progressEvery=${PROGRESS_LOG_EVERY}, minAssetCount=${MIN_ASSET_COUNT}, ` +
      `detailEnrichment=${ENABLE_DETAIL_ENRICHMENT ? 'on' : 'off'}.`
  );
  console.log(
    `Network plan: CoinGecko requests~${estimatedCoinGeckoRequests} for market metadata, ` +
      `then Yahoo chart history in batches for up to ${TARGET_ASSET_COUNT} accepted assets ` +
      `(best-effort mode will build with any result >= ${MIN_ASSET_COUNT}).`
  );
  console.log(
    `Loaded ${cachedSelectedAssets.size} cached crypto assets for incremental source refresh.`
  );

  await mkdir(OUTPUT_ROOT_DIR, { recursive: true });

  const candidateMarkets = await fetchCandidateMarkets();
  console.log(`Fetched ${candidateMarkets.length} CoinGecko market candidates.`);

  const { kept: filteredMarkets, skipped: prefilterSkips } = prefilterCandidateMarkets(candidateMarkets);
  console.log(
    `Prefilter kept ${filteredMarkets.length} candidates after obvious exclusions ` +
      `(skipped=[${summarizeSkipCounts(prefilterSkips)}]).`
  );

  const selectedAssets: SelectedAsset[] = [];
  const skipCounts = new Map(prefilterSkips);
  const usedSymbols = new Set([...cachedSelectedAssets.values()].map((asset) => asset.symbol));
  let processedCandidates = 0;

  let nextCandidateIndex = 0;
  let historyBatchNumber = 0;

  while (selectedAssets.length < TARGET_ASSET_COUNT && nextCandidateIndex < filteredMarkets.length) {
    const historyBatchMarkets = filteredMarkets.slice(
      nextCandidateIndex,
      nextCandidateIndex + HISTORY_FETCH_BATCH_SIZE
    );
    nextCandidateIndex += historyBatchMarkets.length;
    historyBatchNumber += 1;

    console.log(
      `Fetching Yahoo history batch ${historyBatchNumber} for ${historyBatchMarkets.length} candidates ` +
        `with concurrency=${HISTORY_FETCH_CONCURRENCY}.`
    );

    const batchResults = await mapConcurrent(
      historyBatchMarkets,
      HISTORY_FETCH_CONCURRENCY,
      async (market) => {
        const cachedAsset = cachedSelectedAssets.get(market.id) ?? null;
        const historySymbol = cachedAsset?.historySymbol ?? buildYahooHistorySymbol(market.symbol);
        if (!historySymbol) {
          if (canReuseCachedSelectedAsset(cachedAsset)) {
            return {
              market,
              historySymbol: cachedAsset.historySymbol,
              rows: cachedAsset.rows,
              errorMessage: null
            } satisfies HistoryFetchResult;
          }

          return {
            market,
            historySymbol: null,
            rows: [],
            errorMessage: `Unsupported Yahoo symbol mapping for raw symbol ${market.symbol}.`
          } satisfies HistoryFetchResult;
        }

        try {
          const symbol = cachedAsset?.symbol ?? makeCanonicalSymbol(market.symbol, market.id, usedSymbols);
          const fetchStartDate = deriveCryptoHistoryFetchStartDate(cachedAsset?.lastTradeDate ?? null);
          const fetchedRows = await fetchYahooHistoryRows(historySymbol, fetchStartDate);

          return {
            market,
            historySymbol,
            rows: mergeCsvRows(
              cachedAsset?.rows ?? [],
              fetchedRows.map((row) => ({
                ...row,
                symbol
              }))
            ),
            errorMessage: null
          } satisfies HistoryFetchResult;
        } catch (error) {
          if (canReuseCachedSelectedAsset(cachedAsset)) {
            return {
              market,
              historySymbol: cachedAsset.historySymbol,
              rows: cachedAsset.rows,
              errorMessage: null
            } satisfies HistoryFetchResult;
          }

          return {
            market,
            historySymbol,
            rows: [],
            errorMessage: getErrorMessage(error)
          } satisfies HistoryFetchResult;
        }
      },
      (completed) => {
        if (completed % PROGRESS_LOG_EVERY === 0 || completed === historyBatchMarkets.length) {
          console.log(
            `Yahoo history batch ${historyBatchNumber} progress: fetched=${completed}/${historyBatchMarkets.length}, ` +
              `elapsed=${formatElapsed(Date.now() - startedAt)}.`
          );
        }
      }
    );

    for (const result of batchResults) {
      if (selectedAssets.length >= TARGET_ASSET_COUNT) {
        break;
      }

      processedCandidates += 1;

      if (result.errorMessage) {
        incrementCount(skipCounts, 'request_failed');
        console.warn(
          `Skipping Yahoo history asset ${result.market.id} (${result.historySymbol ?? result.market.symbol}) after request failure: ` +
            result.errorMessage
        );
        logSelectionProgress({
          processedCandidates,
          selectedCount: selectedAssets.length,
          skipCounts,
          startedAt,
          currentAsset: result.market.id
        });
        continue;
      }

      if (result.rows.length < MIN_REQUIRED_HISTORY_ROWS) {
        incrementCount(skipCounts, 'insufficient_history');
        logSelectionProgress({
          processedCandidates,
          selectedCount: selectedAssets.length,
          skipCounts,
          startedAt,
          currentAsset: result.market.id
        });
        continue;
      }

      const cachedAsset = cachedSelectedAssets.get(result.market.id) ?? null;
      const symbol = result.rows[0]?.symbol ?? cachedAsset?.symbol ?? makeCanonicalSymbol(result.market.symbol, result.market.id, usedSymbols);
      const sector =
        cachedAsset?.sector ?? assignSector([], result.market.name, result.market.symbol, result.market.id);
      const rows = result.rows;

      selectedAssets.push({
        coinId: result.market.id,
        historySymbol: result.historySymbol ?? 'unknown',
        symbol,
        rawSymbol: result.market.symbol.toUpperCase(),
        name: result.market.name,
        marketCapRank: result.market.market_cap_rank ?? Number.MAX_SAFE_INTEGER,
        marketCapUsd: result.market.market_cap,
        currentVolumeUsd: result.market.total_volume,
        sector,
        categories: cachedAsset?.categories ?? [],
        rows
      });

      logSelectionProgress({
        processedCandidates,
        selectedCount: selectedAssets.length,
        skipCounts,
        startedAt,
        currentAsset: result.market.id,
        force: selectedAssets.length === TARGET_ASSET_COUNT
      });
    }
  }

  selectedAssets.sort((left, right) => left.marketCapRank - right.marketCapRank);

  console.log(
    `Selection complete: ${selectedAssets.length} accepted from ${processedCandidates} processed candidates ` +
      `after ${formatElapsed(Date.now() - startedAt)}.`
  );

  if (selectedAssets.length < TARGET_ASSET_COUNT) {
    console.log(
      `Best-effort mode exhausted current candidates before reaching target ${TARGET_ASSET_COUNT}; ` +
        `continuing with ${selectedAssets.length} accepted assets.`
    );
  }

  if (ENABLE_DETAIL_ENRICHMENT) {
    await enrichSelectedAssets(selectedAssets, startedAt);
  }

  if (selectedAssets.length < MIN_ASSET_COUNT) {
    throw new Error(
      `Only selected ${selectedAssets.length} crypto assets. Need at least ${MIN_ASSET_COUNT} to build the market-map dataset.`
    );
  }

  const csvRows = selectedAssets.flatMap((asset) => asset.rows);
  console.log(`Writing normalized CSV, symbols, and taxonomy files for ${selectedAssets.length} assets.`);
  await writeNormalizedCsv(csvRows, OUTPUT_CSV_PATH);
  await writeFile(
    OUTPUT_SYMBOLS_PATH,
    `${JSON.stringify(selectedAssets.map((asset) => asset.symbol), null, 2)}\n`,
    'utf8'
  );
  await writeFile(
    OUTPUT_TAXONOMY_PATH,
    `${JSON.stringify(
      selectedAssets.map((asset) => ({
        symbol: asset.symbol,
        rawSymbol: asset.rawSymbol,
        coinId: asset.coinId,
        historySymbol: asset.historySymbol,
        name: asset.name,
        marketCapRank: asset.marketCapRank,
        marketCapUsd: asset.marketCapUsd,
        currentVolumeUsd: asset.currentVolumeUsd,
        sector: asset.sector,
        categories: asset.categories,
        rowCount: asset.rows.length,
        firstTradeDate: asset.rows[0]?.tradeDate ?? null,
        lastTradeDate: asset.rows[asset.rows.length - 1]?.tradeDate ?? null
      })),
      null,
      2
    )}\n`,
    'utf8'
  );

  console.log('Upserting crypto security master entries.');

  for (const asset of selectedAssets) {
    await prisma.securityMaster.upsert({
      where: { symbol: asset.symbol },
      update: {
        name: asset.name,
        shortName: asset.rawSymbol,
        securityType: SecurityType.crypto_asset,
        sector: asset.sector,
        market: Market.CRYPTO
      },
      create: {
        symbol: asset.symbol,
        name: asset.name,
        shortName: asset.rawSymbol,
        securityType: SecurityType.crypto_asset,
        sector: asset.sector,
        market: Market.CRYPTO
      }
    });
  }

  console.log('Upserting static and dynamic crypto universes.');
  await upsertStaticUniverses(selectedAssets);
  await upsertDynamicUniverses(selectedAssets);

  console.log(`Importing dataset ${DATASET_ID} into PostgreSQL.`);
  const importSummary = await importEodCsv({
    datasetId: DATASET_ID,
    datasetName: DATASET_NAME,
    csvPath: OUTPUT_CSV_PATH,
    market: Market.CRYPTO,
    importMode: IMPORT_MODE,
    prismaClient: prisma,
    transactionTimeoutMs: 900_000
  });

  console.log(
    `Imported ${importSummary.rowCount} rows across ${importSummary.symbolCount} symbols ` +
      `(${importSummary.minTradeDate}..${importSummary.maxTradeDate}).`
  );

  let completedBuild: {
    id: string;
    status: string;
    errorMessage: string | null;
    artifact: {
      symbolCount: number;
      minScore: number | null;
      maxScore: number | null;
      matrixByteSize: bigint | null;
      previewByteSize: bigint | null;
      manifestByteSize: bigint | null;
    } | null;
  } | null = null;

  if (SKIP_VERIFICATION_BUILD) {
    console.log('Skipping crypto verification build because CRYPTO_MARKET_MAP_SKIP_VERIFICATION_BUILD=1.');
  } else {
    const buildRun = await prisma.buildRun.create({
      data: {
        datasetId: DATASET_ID,
        universeId: BUILD_UNIVERSE_ID,
        asOfDate: importSummary.maxTradeDate,
        windowDays: BUILD_WINDOW_DAYS,
        scoreMethod: BUILD_SCORE_METHOD
      }
    });

    console.log(`Running verification build ${buildRun.id} on universe ${BUILD_UNIVERSE_ID}.`);
    await runBuild(buildRun.id);

    completedBuild = await prisma.buildRun.findUnique({
      where: { id: buildRun.id },
      include: { artifact: true }
    });

    if (!completedBuild || completedBuild.status !== 'succeeded' || !completedBuild.artifact) {
      throw new Error(
        `Crypto market-map build ${buildRun.id} did not succeed: ${completedBuild?.errorMessage ?? 'unknown error'}`
      );
    }

    console.log(`Verification build ${buildRun.id} succeeded after ${formatElapsed(Date.now() - startedAt)}.`);
  }

  console.log(
    JSON.stringify(
      {
        datasetId: DATASET_ID,
        datasetName: DATASET_NAME,
        symbolCount: selectedAssets.length,
        rowCount: importSummary.rowCount,
        minTradeDate: importSummary.minTradeDate,
        maxTradeDate: importSummary.maxTradeDate,
        buildRunId: completedBuild?.id ?? null,
        buildUniverseId: BUILD_UNIVERSE_ID,
        buildStatus: completedBuild?.status ?? null,
        artifact: completedBuild?.artifact
          ? {
              symbolCount: completedBuild.artifact.symbolCount,
              minScore: completedBuild.artifact.minScore,
              maxScore: completedBuild.artifact.maxScore,
              matrixByteSize: completedBuild.artifact.matrixByteSize?.toString() ?? null,
              previewByteSize: completedBuild.artifact.previewByteSize?.toString() ?? null,
              manifestByteSize: completedBuild.artifact.manifestByteSize?.toString() ?? null
            }
          : null,
        sectors: summarizeSectors(selectedAssets),
        skipped: Object.fromEntries([...skipCounts.entries()].sort((left, right) => left[0].localeCompare(right[0]))),
        output: {
          csvPath: OUTPUT_CSV_PATH,
          symbolsPath: OUTPUT_SYMBOLS_PATH,
          taxonomyPath: OUTPUT_TAXONOMY_PATH
        }
      },
      null,
      2
    )
  );
}

function parsePositiveInteger(rawValue: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function incrementCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function formatElapsed(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}m${seconds.toString().padStart(2, '0')}s`;
}

function summarizeSkipCounts(skipCounts: Map<string, number>): string {
  if (skipCounts.size === 0) {
    return 'none';
  }

  return [...skipCounts.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([key, count]) => `${key}=${count}`)
    .join(', ');
}

function logSelectionProgress(args: {
  processedCandidates: number;
  selectedCount: number;
  skipCounts: Map<string, number>;
  startedAt: number;
  currentAsset: string;
  force?: boolean;
}) {
  if (!args.force && args.processedCandidates % PROGRESS_LOG_EVERY !== 0) {
    return;
  }

  console.log(
    `Selection progress: processed=${args.processedCandidates}, accepted=${args.selectedCount}, ` +
      `skipped=[${summarizeSkipCounts(args.skipCounts)}], ` +
      `last=${args.currentAsset}, elapsed=${formatElapsed(Date.now() - args.startedAt)}.`
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function throttleRequests() {
  const now = Date.now();
  const waitMs = COINGECKO_REQUEST_DELAY_MS - (now - lastCoinGeckoRequestStartedAt);

  if (waitMs > 0) {
    await sleep(waitMs);
  }

  lastCoinGeckoRequestStartedAt = Date.now();
}

async function fetchCoinGeckoJson<T>(path: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_REQUEST_RETRIES; attempt += 1) {
    await throttleRequests();

    const response = await fetch(`${COINGECKO_BASE_URL}${path}`, {
      headers: {
        'user-agent': 'RiskAtlasCryptoMarketMap/1.0'
      }
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    const bodyText = await response.text();
    const retryAfterSeconds = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
    const backoffMs = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1_000
      : attempt * COINGECKO_REQUEST_DELAY_MS * 2;

    lastError = new Error(
      `CoinGecko request failed for ${path} with ${response.status}: ${bodyText.slice(0, 300)}`
    );

    if (response.status === 429 || response.status >= 500) {
      await sleep(backoffMs);
      continue;
    }

    throw lastError;
  }

  throw lastError ?? new Error(`CoinGecko request failed for ${path}.`);
}

async function fetchCandidateMarkets(): Promise<CoinGeckoMarketEntry[]> {
  const byId = new Map<string, CoinGeckoMarketEntry>();

  for (let page = 1; page <= CANDIDATE_PAGE_COUNT; page += 1) {
    console.log(`Fetching CoinGecko market page ${page}/${CANDIDATE_PAGE_COUNT}.`);

    const entries = await fetchCoinGeckoJson<CoinGeckoMarketEntry[]>(
      `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${MARKETS_PER_PAGE}&page=${page}&sparkline=false`
    );

    for (const entry of entries) {
      if (
        entry.id &&
        entry.market_cap_rank !== null &&
        entry.current_price !== null &&
        entry.total_volume !== null &&
        entry.total_volume > 0
      ) {
        byId.set(entry.id, entry);
      }
    }

    console.log(`Accepted ${byId.size} unique market candidates after page ${page}.`);
  }

  return [...byId.values()].sort((left, right) => {
    const leftRank = left.market_cap_rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.market_cap_rank ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.id.localeCompare(right.id);
  });
}

async function fetchCoinDetail(id: string): Promise<CoinGeckoCoinDetail> {
  return fetchCoinGeckoJson<CoinGeckoCoinDetail>(
    `/coins/${id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`
  );
}

function buildYahooHistorySymbol(rawSymbol: string): string | null {
  const normalized = rawSymbol.trim().toUpperCase();
  if (!/^[A-Z0-9]+$/.test(normalized)) {
    return null;
  }

  return `${normalized}-USD`;
}

function buildYahooChartUrl(symbol: string, startDate: string, endDate: string): string {
  const period1 = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000);
  const period2 = Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000);

  return `${YAHOO_CHART_BASE_URL}/${symbol}?period1=${period1}&period2=${period2}&interval=1d&includeAdjustedClose=true&events=div%2Csplits`;
}

async function fetchYahooHistoryRows(symbol: string, startDate: string): Promise<CsvRow[]> {
  const response = await fetch(buildYahooChartUrl(symbol, startDate, toIsoDate(Date.now())), {
    headers: {
      'user-agent': 'RiskAtlasCryptoMarketMap/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Yahoo chart request failed for ${symbol} with ${response.status}.`);
  }

  const payload = (await response.json()) as YahooChartResponse;
  const chartError = payload.chart?.error;
  if (chartError?.description) {
    throw new Error(`Yahoo chart request failed for ${symbol}: ${chartError.description}`);
  }

  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const adjCloses = result?.indicators?.adjclose?.[0]?.adjclose;
  const closes = result?.indicators?.quote?.[0]?.close;
  const volumes = result?.indicators?.quote?.[0]?.volume;

  if (timestamps.length === 0) {
    throw new Error(`Yahoo chart returned no timestamps for ${symbol}.`);
  }

  const rows: CsvRow[] = [];

  for (let index = 0; index < timestamps.length; index += 1) {
    const timestampSeconds = timestamps[index];
    const rawPrice = adjCloses?.[index] ?? closes?.[index] ?? null;
    if (rawPrice === null || !Number.isFinite(rawPrice) || !timestampSeconds || rawPrice <= 0) {
      continue;
    }

    const price = rawPrice;

    const rawVolume = volumes?.[index] ?? null;
    rows.push({
      tradeDate: toIsoDate(timestampSeconds * 1000),
      symbol: '',
      adjClose: price,
      volume:
        rawVolume !== null && Number.isFinite(rawVolume) && rawVolume >= 0
          ? BigInt(Math.round(rawVolume))
          : null
    });
  }

  return rows.sort((left, right) => left.tradeDate.localeCompare(right.tradeDate));
}

function toIsoDate(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function prefilterCandidateMarkets(markets: CoinGeckoMarketEntry[]): {
  kept: CoinGeckoMarketEntry[];
  skipped: Map<string, number>;
} {
  const kept: CoinGeckoMarketEntry[] = [];
  const skipped = new Map<string, number>();

  for (const market of markets) {
    const reason = classifyExclusionReason([], market.name, market.symbol, market.id, market.current_price);
    if (reason) {
      incrementCount(skipped, reason);
      continue;
    }

    kept.push(market);
  }

  return { kept, skipped };
}

function classifyExclusionReason(
  categories: string[],
  name: string,
  rawSymbol?: string,
  coinId?: string,
  currentPrice?: number | null
): string | null {
  const labels = normalizeLabels(categories, name, rawSymbol, coinId);
  const normalizedSymbol = rawSymbol?.trim().toUpperCase() ?? '';

  if (
    hasAnyLabel(labels, ['stablecoin', 'stable coin', 'synthetic dollar']) ||
    KNOWN_STABLE_SYMBOLS.has(normalizedSymbol) ||
    (currentPrice !== null &&
      currentPrice !== undefined &&
      currentPrice >= 0.85 &&
      currentPrice <= 1.15 &&
      hasAnyLabel(labels, [' usd', 'dollar', 'eur', 'euro', 'gbp']))
  ) {
    return 'stablecoin';
  }

  if (
    hasAnyLabel(labels, ['wrapped token', 'wrapped-token', 'wrapped', 'bridged', 'bridge']) ||
    KNOWN_WRAPPED_OR_LST_SYMBOLS.has(normalizedSymbol)
  ) {
    return 'wrapped_or_bridged';
  }

  if (
    hasAnyLabel(labels, [
      'leveraged token',
      'bullish leveraged token',
      'bearish leveraged token',
      '2x',
      '3x',
      'bull',
      'bear'
    ])
  ) {
    return 'leveraged';
  }

  if (
    hasAnyLabel(labels, [
      'liquid staking',
      'liquid restaking',
      'lsdfi',
      'restaking',
      'restaked',
      'staked ether',
      'staked sol',
      'staked sui'
    ]) ||
    KNOWN_WRAPPED_OR_LST_SYMBOLS.has(normalizedSymbol)
  ) {
    return 'liquid_staking';
  }

  return null;
}

function assignSector(
  categories: string[],
  name: string,
  rawSymbol: string,
  coinId?: string
): Sector | null {
  const labels = normalizeLabels(categories, name, rawSymbol, coinId);

  if (hasAnyLabel(labels, ['real world asset', 'rwa'])) {
    return Sector.rwa;
  }

  if (hasAnyLabel(labels, ['privacy'])) {
    return Sector.privacy;
  }

  if (hasAnyLabel(labels, ['oracle'])) {
    return Sector.oracle;
  }

  if (
    hasAnyLabel(labels, [
      'exchange-based token',
      'centralized exchange',
      'cex',
      'binance',
      'gate token',
      'okb',
      'bitget',
      'leo token',
      'kucoin',
      'htx',
      'whitebit'
    ])
  ) {
    return Sector.exchange;
  }

  if (
    hasAnyLabel(labels, [
      'decentralized finance',
      'defi',
      'decentralized exchange',
      'yield farming',
      'lending',
      'borrowing',
      'derivatives',
      'perpetual',
      'synthetic',
      'amm'
    ])
  ) {
    return Sector.defi;
  }

  if (hasAnyLabel(labels, ['meme', 'dogecoin', 'shiba', 'pepe', 'bonk', 'floki', 'dogwif'])) {
    return Sector.meme;
  }

  if (hasAnyLabel(labels, ['gaming', 'gamefi', 'metaverse'])) {
    return Sector.gaming;
  }

  if (hasAnyLabel(labels, ['payment', 'payments', 'xrp', 'stellar', 'litecoin', 'bitcoin cash'])) {
    return Sector.payment;
  }

  if (hasAnyLabel(labels, ['artificial intelligence', 'ai', 'agent', 'big data'])) {
    return Sector.ai_data;
  }

  if (
    hasAnyLabel(labels, [
      'depin',
      'decentralized physical infrastructure',
      'storage',
      'data availability',
      'interoperability',
      'cross-chain',
      'computing',
      'identity',
      'infrastructure'
    ])
  ) {
    return Sector.infrastructure;
  }

  if (
    hasAnyLabel(labels, [
      'layer 0',
      'layer 1',
      'layer 2',
      'smart contract platform',
      'blockchain',
      'modular blockchain',
      'rollup',
      'scaling',
      'bitcoin ecosystem',
      'parallelized evm'
    ])
  ) {
    return Sector.platform;
  }

  if (hasAnyLabel(labels, ['nft', 'social', 'creator', 'fan token'])) {
    return Sector.consumer;
  }

  return null;
}

function normalizeLabels(...groups: Array<string[] | string | null | undefined>): string[] {
  return groups
    .flatMap((group) => {
      if (Array.isArray(group)) {
        return group;
      }

      return group ? [group] : [];
    })
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function hasAnyLabel(labels: string[], fragments: string[]): boolean {
  return labels.some((label) => fragments.some((fragment) => label.includes(fragment)));
}

async function enrichSelectedAssets(selectedAssets: SelectedAsset[], startedAt: number): Promise<void> {
  const targets = selectedAssets.filter((asset) => asset.sector === null);

  if (targets.length === 0) {
    console.log('Detail enrichment skipped because all selected assets already received heuristic sectors.');
    return;
  }

  console.log(
    `Detail enrichment enabled for ${targets.length} assets without heuristic sectors.`
  );

  for (let index = 0; index < targets.length; index += 1) {
    const asset = targets[index]!;
    const detail = await fetchCoinDetail(asset.coinId);
    asset.categories = detail.categories ?? [];

    const refinedSector = assignSector(asset.categories, asset.name, asset.rawSymbol, asset.coinId);
    if (refinedSector !== null) {
      asset.sector = refinedSector;
    }

    if ((index + 1) % PROGRESS_LOG_EVERY === 0 || index === targets.length - 1) {
      console.log(
        `Detail enrichment progress: processed=${index + 1}/${targets.length}, ` +
          `elapsed=${formatElapsed(Date.now() - startedAt)}.`
      );
    }
  }
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (completed: number) => void
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let completed = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await worker(items[currentIndex]!, currentIndex);
      completed += 1;
      onProgress?.(completed);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  );

  return results;
}

function makeCanonicalSymbol(rawSymbol: string, coinId: string, usedSymbols: Set<string>): string {
  const base = rawSymbol.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '') || 'COIN';
  const preferred = `${base.slice(0, 29)}.CG`;

  if (!usedSymbols.has(preferred)) {
    usedSymbols.add(preferred);
    return preferred;
  }

  const hash = createHash('sha1').update(coinId).digest('hex').slice(0, 5).toUpperCase();
  const fallback = `${base.slice(0, 26)}.${hash}`;

  if (!usedSymbols.has(fallback)) {
    usedSymbols.add(fallback);
    return fallback;
  }

  let suffix = 2;
  while (suffix < 1000) {
    const candidate = `${base.slice(0, 24)}${suffix}.${hash.slice(0, 4)}`;
    if (!usedSymbols.has(candidate)) {
      usedSymbols.add(candidate);
      return candidate;
    }
    suffix += 1;
  }

  throw new Error(`Unable to generate a unique symbol for CoinGecko asset ${coinId}.`);
}

async function loadCachedSelectedAssets(
  taxonomyPath: string,
  csvPath: string
): Promise<Map<string, CachedSelectedAsset>> {
  const assets = new Map<string, CachedSelectedAsset>();

  if (!existsSync(taxonomyPath) || !existsSync(csvPath)) {
    return assets;
  }

  const rowsBySymbol = await loadCachedCryptoRowsBySymbol(csvPath);
  const raw = await readFile(taxonomyPath, 'utf8');
  const parsed = JSON.parse(raw) as CachedSelectedAssetSnapshot[];

  for (const entry of parsed) {
    if (!entry.coinId || !entry.symbol || !entry.historySymbol) {
      continue;
    }

    const rows = rowsBySymbol.get(entry.symbol) ?? [];
    const lastTradeDate = rows[rows.length - 1]?.tradeDate ?? entry.lastTradeDate ?? '';

    assets.set(entry.coinId, {
      coinId: entry.coinId,
      historySymbol: entry.historySymbol,
      symbol: entry.symbol,
      rawSymbol: entry.rawSymbol,
      name: entry.name,
      sector: entry.sector,
      categories: entry.categories ?? [],
      rows,
      lastTradeDate
    });
  }

  return assets;
}

async function loadCachedCryptoRowsBySymbol(csvPath: string): Promise<Map<string, CsvRow[]>> {
  const rowsBySymbol = new Map<string, CsvRow[]>();

  const input = createReadStream(csvPath, { encoding: 'utf8' });
  const readline = createInterface({
    input,
    crlfDelay: Infinity
  });

  let seenHeader = false;
  let hasVolume = false;

  for await (const rawLine of readline) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (!seenHeader) {
      seenHeader = true;
      hasVolume = line === 'tradeDate,symbol,adjClose,volume';
      continue;
    }

    const parts = line.split(',');
    const tradeDate = parts[0] ?? '';
    const symbol = (parts[1] ?? '').toUpperCase();
    const adjClose = Number(parts[2] ?? '');
    const volumeText = hasVolume ? parts[3] ?? '' : '';

    const rows = rowsBySymbol.get(symbol) ?? [];
    rows.push({
      tradeDate,
      symbol,
      adjClose,
      volume: volumeText ? BigInt(volumeText) : null
    });
    rowsBySymbol.set(symbol, rows);
  }

  return rowsBySymbol;
}

function canReuseCachedSelectedAsset(asset: CachedSelectedAsset | null): asset is CachedSelectedAsset {
  return Boolean(asset && asset.rows.length >= MIN_REQUIRED_HISTORY_ROWS && asset.lastTradeDate);
}

function mergeCsvRows(existingRows: CsvRow[], refreshedRows: CsvRow[]): CsvRow[] {
  const byTradeDate = new Map(existingRows.map((row) => [row.tradeDate, row] as const));

  for (const row of refreshedRows) {
    byTradeDate.set(row.tradeDate, row);
  }

  return [...byTradeDate.values()].sort((left, right) => left.tradeDate.localeCompare(right.tradeDate));
}

function deriveCryptoHistoryFetchStartDate(lastTradeDate: string | null): string {
  if (!lastTradeDate) {
    return toIsoDate(Date.now() - (HISTORY_DAYS + 14) * 24 * 60 * 60 * 1000);
  }

  return shiftIsoDate(lastTradeDate, -SOURCE_REFRESH_OVERLAP_DAYS);
}

function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

async function upsertStaticUniverses(selectedAssets: SelectedAsset[]) {
  const orderedSymbols = selectedAssets.map((asset) => asset.symbol);

  for (const definition of STATIC_UNIVERSE_DEFINITIONS) {
    const symbols = 'take' in definition ? orderedSymbols.slice(0, definition.take) : orderedSymbols;

    await prisma.universe.upsert({
      where: { id: definition.id },
      update: {
        name: definition.name,
        market: Market.CRYPTO,
        symbolsJson: symbols as Prisma.InputJsonValue,
        symbolCount: symbols.length,
        definitionKind: 'static',
        definitionParams: Prisma.JsonNull
      },
      create: {
        id: definition.id,
        name: definition.name,
        market: Market.CRYPTO,
        symbolsJson: symbols as Prisma.InputJsonValue,
        symbolCount: symbols.length,
        definitionKind: 'static',
        definitionParams: Prisma.JsonNull
      }
    });
  }
}

async function upsertDynamicUniverses(selectedAssets: SelectedAsset[]) {
  for (const definition of DYNAMIC_LIQUIDITY_UNIVERSES) {
    await prisma.universe.upsert({
      where: { id: definition.id },
      update: {
        name: definition.name,
        market: Market.CRYPTO,
        symbolsJson: Prisma.JsonNull,
        symbolCount: null,
        definitionKind: 'liquidity_top_n',
        definitionParams: {
          topN: definition.topN,
          advDays: LIQUIDITY_ADV_DAYS
        } as Prisma.InputJsonValue
      },
      create: {
        id: definition.id,
        name: definition.name,
        market: Market.CRYPTO,
        symbolsJson: Prisma.JsonNull,
        symbolCount: null,
        definitionKind: 'liquidity_top_n',
        definitionParams: {
          topN: definition.topN,
          advDays: LIQUIDITY_ADV_DAYS
        } as Prisma.InputJsonValue
      }
    });
  }

  const sectorCounts = new Map<Sector, number>();
  for (const asset of selectedAssets) {
    if (!asset.sector) {
      continue;
    }

    sectorCounts.set(asset.sector, (sectorCounts.get(asset.sector) ?? 0) + 1);
  }

  for (const [sector, count] of [...sectorCounts.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
    if (count < MIN_SECTOR_UNIVERSE_SIZE) {
      continue;
    }

    await prisma.universe.upsert({
      where: { id: `crypto_${sector}` },
      update: {
        name: getSectorUniverseName(sector),
        market: Market.CRYPTO,
        symbolsJson: Prisma.JsonNull,
        symbolCount: null,
        definitionKind: 'sector_filter',
        definitionParams: {
          sectors: [sector]
        } as Prisma.InputJsonValue
      },
      create: {
        id: `crypto_${sector}`,
        name: getSectorUniverseName(sector),
        market: Market.CRYPTO,
        symbolsJson: Prisma.JsonNull,
        symbolCount: null,
        definitionKind: 'sector_filter',
        definitionParams: {
          sectors: [sector]
        } as Prisma.InputJsonValue
      }
    });
  }
}

function getSectorUniverseName(sector: Sector): string {
  switch (sector) {
    case Sector.platform:
      return 'Crypto Platforms';
    case Sector.exchange:
      return 'Crypto Exchanges';
    case Sector.defi:
      return 'Crypto DeFi';
    case Sector.oracle:
      return 'Crypto Oracles';
    case Sector.infrastructure:
      return 'Crypto Infrastructure';
    case Sector.meme:
      return 'Crypto Meme';
    case Sector.gaming:
      return 'Crypto Gaming';
    case Sector.payment:
      return 'Crypto Payments';
    case Sector.privacy:
      return 'Crypto Privacy';
    case Sector.rwa:
      return 'Crypto Real-World Assets';
    case Sector.ai_data:
      return 'Crypto AI & Data';
    case Sector.consumer:
      return 'Crypto Consumer';
    default:
      return `Crypto ${sector}`;
  }
}

function summarizeSectors(selectedAssets: SelectedAsset[]): Array<{
  sector: string | null;
  count: number;
}> {
  const counts = new Map<string, number>();

  for (const asset of selectedAssets) {
    const key = asset.sector ?? '__null__';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([sector, count]) => ({
      sector: sector === '__null__' ? null : sector,
      count
    }))
    .sort((left, right) => {
      const countDiff = right.count - left.count;
      if (countDiff !== 0) {
        return countDiff;
      }

      return (left.sector ?? 'zzzz').localeCompare(right.sector ?? 'zzzz');
    });
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

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main()
    .catch((error) => {
      console.error('Crypto market-map import failed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}