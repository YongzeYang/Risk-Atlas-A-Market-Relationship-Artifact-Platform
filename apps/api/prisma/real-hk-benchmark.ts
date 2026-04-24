import 'dotenv/config';

import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { Market, Prisma, SecurityType, Sector } from '@prisma/client';
import * as XLSX from 'xlsx';

import { prisma } from '../src/lib/prisma.js';
import {
  assessBuildRequestCoverage,
  getBuildRequestValidationForResolvedUniverse
} from '../src/services/build-request-validation-service.js';
import { computeLogReturns } from '../src/services/correlation-analytics.js';
import { runBuild } from '../src/services/build-run-runner.js';
import { importEodCsv, type ImportEodCsvSummary } from './import-eod.js';
import { MIN_REQUIRED_PRICE_ROWS } from './mvp-config.js';

const DATASET_ID = 'hk_eod_yahoo_real_v1';
const DATASET_NAME = 'Hong Kong EOD Real Yahoo Chart v1';
const OUTPUT_ROOT_DIR = resolve(process.cwd(), '../../data/real-hk');
const OUTPUT_CSV_PATH = resolve(OUTPUT_ROOT_DIR, 'hk_eod_yahoo_real_v1.csv');
const OUTPUT_SYMBOLS_PATH = resolve(OUTPUT_ROOT_DIR, 'hk_eod_yahoo_real_v1.symbols.json');
const OUTPUT_TAXONOMY_PATH = resolve(OUTPUT_ROOT_DIR, 'hk_eod_yahoo_real_v1.taxonomy.json');
const OUTPUT_HKEX_WORKBOOK_PATH = resolve(OUTPUT_ROOT_DIR, 'hkex_ListOfSecurities.xlsx');
const OUTPUT_REPORT_PATH = resolve(
  process.cwd(),
  `../../artifacts/benchmark-reports/hk-real-yahoo-benchmark-${new Date().toISOString().slice(0, 10)}.json`
);

const HKEX_FULL_LIST_URL = 'https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx';
const FETCH_START_DATE = '2024-01-01';
const FETCH_END_DATE = new Date().toISOString().slice(0, 10);
const FETCH_CONCURRENCY = 12;
const MAX_FETCH_ATTEMPTS = 3;
const NEAR_ZERO_VARIANCE_THRESHOLD = 1e-20;
const WINDOW_DAYS = 252;
const TAXONOMY_ONLY_MODE = process.argv.includes('--taxonomy-only');
const SKIP_BENCHMARKS_MODE = process.argv.includes('--skip-benchmarks');
const IMPORT_MODE =
  (process.env.RISK_ATLAS_IMPORT_EOD_MODE ?? 'replace').trim() === 'merge' ? 'merge' : 'replace';
const SKIP_ALIGNMENT_AUDIT = (process.env.RISK_ATLAS_SKIP_ALIGNMENT_AUDIT ?? '0').trim() === '1';
const SOURCE_REFRESH_OVERLAP_DAYS = Number.parseInt(
  process.env.RISK_ATLAS_HK_SOURCE_REFRESH_OVERLAP_DAYS ?? '45',
  10
);
const OFFICIAL_EQUITY_SUBCATEGORIES = new Set([
  'Equity Securities (Main Board)',
  'Equity Securities (GEM)'
]);
const BENCHMARK_PLANS = [
  { universeId: 'hk_real_yahoo_300', universeName: 'HK Real Yahoo 300', requestedSymbolCount: 300 },
  { universeId: 'hk_real_yahoo_500', universeName: 'HK Real Yahoo 500', requestedSymbolCount: 500 },
  { universeId: 'hk_real_yahoo_1000', universeName: 'HK Real Yahoo 1000', requestedSymbolCount: 1000 }
] as const;

type PricePoint = {
  tradeDate: string;
  adjClose: number;
  volume: bigint | null;
};

type OfficialSecurity = {
  symbol: string;
  stockCode: string;
  name: string;
  board: 'main_board' | 'gem';
};

type SymbolHistory = {
  symbol: string;
  name: string;
  prices: PricePoint[];
  lastTradeDate: string;
};

type SecurityTaxonomySnapshot = {
  symbol: string;
  shortName: string | null;
  rawSector: string | null;
  rawIndustry: string | null;
  broadSector: Sector | null;
  source: 'cache' | 'yahoo_search' | 'name_heuristic' | 'unmapped';
};

type TaxonomyRefreshOutcome = {
  snapshots: SecurityTaxonomySnapshot[];
  reusedSnapshotCount: number;
  fetchedSnapshotCount: number;
};

type BenchmarkEntry = {
  universeId: string;
  universeName: string;
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

type FetchRejectionReason =
  | 'missing_payload'
  | 'not_hkg_equity'
  | 'insufficient_history'
  | 'inactive'
  | 'request_failed';

type FetchRejection = {
  symbol: string;
  name: string;
  reason: FetchRejectionReason;
};

type RefreshOutcome = {
  acceptedHistories: SymbolHistory[];
  rejections: FetchRejection[];
  officialEquities: OfficialSecurity[];
  reusedSymbolCount: number;
  fetchedSymbolCount: number;
};

type IncrementalImportPlan = {
  mergeStartDateBySymbol: Map<string, string>;
  symbolCount: number;
  rowCount: number;
};

type RealCoverageReport = {
  source: string;
  generatedAt: string;
  officialUniverse: {
    sourceUrl: string;
    workbookPath: string;
    filteredSymbolCount: number;
    filter: {
      category: string;
      subCategories: string[];
      tradingCurrency: string;
      excludeRmbCounter: boolean;
    };
  };
  fetch: {
    startDate: string;
    endDate: string;
    activeMinLastTradeDate: string;
    reusedSymbolCount: number;
    fetchedSymbolCount: number;
    acceptedSymbolCount: number;
    rejectedSymbolCount: number;
    rejectionBreakdown: Record<string, number>;
    sampleRejectedSymbols: Array<{ symbol: string; name: string; reason: string }>;
    csvPath: string;
    symbolsPath: string;
  };
  dataset: {
    datasetId: string;
    datasetName: string;
    rowCount: number;
    symbolCount: number;
    minTradeDate: string;
    maxTradeDate: string;
  };
  taxonomy: {
    taxonomyPath: string;
    reusedSnapshotCount: number;
    fetchedSnapshotCount: number;
    broadSectorMappedCount: number;
    broadSectorMappedRate: number;
    rawSectorCount: number;
    rawIndustryCount: number;
    sourceBreakdown: Record<string, number>;
    sampleUnmappedSymbols: Array<{ symbol: string; shortName: string | null; rawSector: string | null; rawIndustry: string | null }>;
  };
  coverageAudit: {
    targetDate: string;
    requiredRows: number;
    officialCommonEquityCount: number;
    datasetImportedSymbolCount: number;
    coverageQualifiedSymbolCount: number;
    matrixReadySymbolCount: number;
    filteredOutSymbolCount: number;
    coverageQualifiedRate: number;
    matrixReadyRate: number;
    latestWindowTradeDateCount: number;
    latestWindowFullSymbolCount: number;
    latestWindowFullRate: number;
    sharedAlignedTradeDateCountAcrossCoverageQualified: number;
    alignmentAuditSkipped: boolean;
    currentValidation: {
      valid: boolean;
      reasonCode: string;
      message: string | null;
    };
  };
  benchmarkEligibility: {
    varianceEligibleSymbolCount: number;
    requestedUniversePlans: Array<{ universeId: string; universeName: string; requestedSymbolCount: number }>;
  };
  benchmarks: BenchmarkEntry[];
};

type WorkbookWithFiles = XLSX.WorkBook & {
  files?: Record<
    string,
    {
      content?: Buffer | Uint8Array | string;
    }
  >;
};

async function main() {
  console.log(
    TAXONOMY_ONLY_MODE
      ? 'Starting official HKEX + Yahoo real HK taxonomy refresh flow.'
      : SKIP_BENCHMARKS_MODE
        ? 'Starting official HKEX + Yahoo real HK refresh/import flow without benchmark builds.'
      : 'Starting official HKEX + Yahoo real HK refresh/import/audit flow.'
  );

  const officialEquities = await downloadAndParseOfficialEquities();
  const currentTaxonomyCache = await loadCachedTaxonomy(
    OUTPUT_TAXONOMY_PATH,
    new Set(officialEquities.map((entry) => entry.symbol))
  );
  const taxonomyOutcome = await refreshOfficialTaxonomy(officialEquities, currentTaxonomyCache);
  await mkdir(OUTPUT_ROOT_DIR, { recursive: true });
  await writeSecurityTaxonomyJson(taxonomyOutcome.snapshots, OUTPUT_TAXONOMY_PATH);
  await upsertSecurityMaster(officialEquities, taxonomyOutcome.snapshots);

  if (TAXONOMY_ONLY_MODE) {
    const mappedCount = taxonomyOutcome.snapshots.filter((snapshot) => snapshot.broadSector !== null).length;
    console.log(
      JSON.stringify(
        {
          mode: 'taxonomy-only',
          officialEquityCount: officialEquities.length,
          mappedCount,
          mappedRate: roundRatio(mappedCount, officialEquities.length),
          reusedSnapshotCount: taxonomyOutcome.reusedSnapshotCount,
          fetchedSnapshotCount: taxonomyOutcome.fetchedSnapshotCount,
          taxonomyPath: OUTPUT_TAXONOMY_PATH
        },
        null,
        2
      )
    );
    return;
  }

  const currentCache = await loadCachedHistories(
    OUTPUT_CSV_PATH,
    new Set(officialEquities.map((entry) => entry.symbol))
  );
  const refreshOutcome = await refreshOfficialUniverseHistories(officialEquities, currentCache);
  const activeMinLastTradeDate = computeActiveMinLastTradeDate(FETCH_END_DATE);
  const datasetSummaryOverride = buildHistoryDatasetSummary(refreshOutcome.acceptedHistories);
  const incrementalImportPlan =
    IMPORT_MODE === 'merge'
      ? buildIncrementalImportPlan(refreshOutcome.acceptedHistories, currentCache)
      : null;

  if (IMPORT_MODE === 'merge' && incrementalImportPlan && incrementalImportPlan.rowCount === 0 && existsSync(OUTPUT_CSV_PATH)) {
    console.log('HK price cache is unchanged after refresh. Skipping full CSV rewrite.');
  } else {
    await writeNormalizedCsv(refreshOutcome.acceptedHistories, OUTPUT_CSV_PATH);
  }
  await writeAcceptedSymbolsJson(refreshOutcome.acceptedHistories, OUTPUT_SYMBOLS_PATH);

  if (IMPORT_MODE === 'merge' && incrementalImportPlan) {
    console.log(
      `Prepared incremental HK import plan for ${incrementalImportPlan.symbolCount.toLocaleString('en-US')} symbols ` +
        `covering ${incrementalImportPlan.rowCount.toLocaleString('en-US')} changed rows.`
    );
  }

  const importSummary = await importEodCsv({
    datasetId: DATASET_ID,
    datasetName: DATASET_NAME,
    csvPath: OUTPUT_CSV_PATH,
    importMode: IMPORT_MODE,
    mergeStartDateBySymbol: incrementalImportPlan?.mergeStartDateBySymbol,
    datasetSummaryOverride,
    prismaClient: prisma,
    transactionTimeoutMs: 900_000
  });

  const universeRow = await prisma.universe.findUnique({
    where: { id: 'hk_all_common_equity' },
    select: {
      id: true,
      definitionKind: true,
      symbolsJson: true,
      definitionParams: true
    }
  });

  if (!universeRow) {
    throw new Error('Universe "hk_all_common_equity" was not found.');
  }

  console.log(
    'HK CSV import finished. Computing post-import coverage assessment for hk_all_common_equity. ' +
      'This can take time on smaller EC2 instances.'
  );
  const coverageAssessment = await assessBuildRequestCoverage({
    datasetId: DATASET_ID,
    universe: universeRow,
    asOfDate: importSummary.maxTradeDate,
    windowDays: WINDOW_DAYS
  });

  console.log(
    `HK coverage assessment complete: ` +
      `${coverageAssessment.coverageQualifiedSymbols.length} coverage-qualified symbols, ` +
      `${coverageAssessment.matrixReadySymbols.length} matrix-ready symbols, ` +
      `${coverageAssessment.filteredOutSymbols.length} filtered-out symbols.`
  );

  console.log('Building HK validation summary from the completed coverage assessment.');
  const validation = await getBuildRequestValidationForResolvedUniverse({
    dataset: {
      id: DATASET_ID,
      market: Market.HK
    },
    universe: universeRow,
    asOfDate: importSummary.maxTradeDate,
    windowDays: WINDOW_DAYS,
    assessment: coverageAssessment
  });

  console.log(
    `HK validation summary complete: valid=${validation.valid ? 'yes' : 'no'}, ` +
      `reason=${validation.reasonCode}.`
  );

  const alignmentAudit = SKIP_ALIGNMENT_AUDIT
    ? {
        latestWindowTradeDateCount: 0,
        latestWindowFullSymbolCount: 0,
        sharedAlignedTradeDateCountAcrossCoverageQualified: 0,
        skipped: true
      }
    : await (async () => {
        console.log(
          'Running HK alignment audit over the latest trading window. ' +
            'This is the last heavy post-import database step before the crypto refresh begins.'
        );

        const result = await measureAlignmentAudit({
          datasetId: DATASET_ID,
          asOfDate: importSummary.maxTradeDate,
          requiredRows: WINDOW_DAYS + 1
        });

        console.log(
          `HK alignment audit complete: ${result.latestWindowTradeDateCount} trade dates in scope, ` +
            `${result.latestWindowFullSymbolCount} full-window symbols, ` +
            `${result.sharedAlignedTradeDateCountAcrossCoverageQualified} shared aligned dates.`
        );

        return {
          ...result,
          skipped: false
        };
      })();

  if (alignmentAudit.skipped) {
    console.log(
      'Skipping HK alignment audit because RISK_ATLAS_SKIP_ALIGNMENT_AUDIT=1. ' +
        'This avoids the heaviest post-import query on small EC2 instances.'
    );
  }

  let benchmarkEligibleSymbols: string[] = [];
  let benchmarkPlans: ReadonlyArray<(typeof BENCHMARK_PLANS)[number]> = [];
  let benchmarks: BenchmarkEntry[] = [];

  if (SKIP_BENCHMARKS_MODE) {
    console.log('Skipping HK benchmark builds because --skip-benchmarks was provided.');
  } else {
    benchmarkEligibleSymbols = await selectBenchmarkEligibleSymbols(DATASET_ID, importSummary.maxTradeDate);
    const acceptedBySymbol = new Map(
      refreshOutcome.acceptedHistories.map((entry) => [entry.symbol, entry] as const)
    );
    const benchmarkHistories = benchmarkEligibleSymbols
      .map((symbol) => acceptedBySymbol.get(symbol))
      .filter((entry): entry is SymbolHistory => entry !== undefined);

    benchmarkPlans = BENCHMARK_PLANS.filter(
      (plan) => benchmarkHistories.length >= plan.requestedSymbolCount
    );

    for (const plan of benchmarkPlans) {
      await upsertStaticUniverse(
        plan.universeId,
        plan.universeName,
        benchmarkHistories.slice(0, plan.requestedSymbolCount)
      );
    }

    benchmarks = await runBenchmarks(importSummary.maxTradeDate, benchmarkPlans);
  }
  const report = buildCoverageReport({
    officialEquities,
    refreshOutcome,
    taxonomyOutcome,
    activeMinLastTradeDate,
    importSummary,
    coverageAssessment,
    validation,
    alignmentAudit,
    benchmarkEligibleSymbols,
    benchmarkPlans,
    benchmarks,
    alignmentAuditSkipped: alignmentAudit.skipped
  });

  await mkdir(resolve(process.cwd(), '../../artifacts/benchmark-reports'), { recursive: true });
  await writeFile(OUTPUT_REPORT_PATH, JSON.stringify(report, null, 2));

  console.log('Real HK refresh complete.');
  console.log(JSON.stringify(report, null, 2));
  console.log(`Report written to ${OUTPUT_REPORT_PATH}`);
}

async function downloadAndParseOfficialEquities(): Promise<OfficialSecurity[]> {
  await mkdir(OUTPUT_ROOT_DIR, { recursive: true });

  const response = await fetch(HKEX_FULL_LIST_URL, {
    headers: {
      accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'user-agent': 'Mozilla/5.0 RiskAtlasOfficialHkex/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download HKEX security list. HTTP ${response.status}.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(OUTPUT_HKEX_WORKBOOK_PATH, buffer);
  const deduped = new Map<string, OfficialSecurity>();
  for (const row of parseOfficialWorkbookRows(buffer)) {
    const category = row.category;
    const subCategory = row.subCategory;
    const tradingCurrency = row.tradingCurrency;
    const rmbCounter = row.rmbCounter;

    if (category !== 'Equity') {
      continue;
    }

    if (!OFFICIAL_EQUITY_SUBCATEGORIES.has(subCategory)) {
      continue;
    }

    if (tradingCurrency !== 'HKD') {
      continue;
    }

    if (rmbCounter) {
      continue;
    }

    const stockCodeText = normalizeOfficialStockCode(row.stockCode);
    if (!stockCodeText) {
      continue;
    }

    const symbol = `${stockCodeText}.HK`;
    deduped.set(symbol, {
      symbol,
      stockCode: stockCodeText,
      name: row.name || symbol,
      board: subCategory === 'Equity Securities (GEM)' ? 'gem' : 'main_board'
    });
  }

  return [...deduped.values()].sort((left, right) => left.symbol.localeCompare(right.symbol));
}

function normalizeOfficialStockCode(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }

  const normalizedNumber = Number.parseInt(text, 10);
  if (!Number.isFinite(normalizedNumber)) {
    return null;
  }

  return normalizedNumber.toString().padStart(4, '0');
}

function parseOfficialWorkbookRows(buffer: Buffer): Array<{
  stockCode: string;
  name: string;
  category: string;
  subCategory: string;
  tradingCurrency: string;
  rmbCounter: string;
}> {
  const workbook = XLSX.read(buffer, { type: 'buffer', bookFiles: true }) as WorkbookWithFiles;
  const sheetXml = getWorkbookEntryText(workbook, 'xl/worksheets/sheet1.xml');
  const sharedStrings = parseSharedStrings(getWorkbookEntryText(workbook, 'xl/sharedStrings.xml'));
  const rows: Array<{
    stockCode: string;
    name: string;
    category: string;
    subCategory: string;
    tradingCurrency: string;
    rmbCounter: string;
  }> = [];

  for (const rowMatch of sheetXml.matchAll(/<[^:>]*:?row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/[^:>]*:?row>/g)) {
    const rowNumber = Number.parseInt(rowMatch[1] ?? '', 10);
    const rowXml = rowMatch[2] ?? '';
    if (!Number.isFinite(rowNumber) || rowNumber < 4) {
      continue;
    }

    const cellValues = parseWorksheetCellMap(rowXml, sharedStrings);
    const stockCode = (cellValues.get('A') ?? '').trim();
    const name = (cellValues.get('B') ?? '').trim();
    const category = (cellValues.get('C') ?? '').trim();
    const subCategory = (cellValues.get('D') ?? '').trim();
    const tradingCurrency = (cellValues.get('Q') ?? '').trim();
    const rmbCounter = (cellValues.get('R') ?? '').trim();

    if (!stockCode || !name || !category || !subCategory) {
      continue;
    }

    rows.push({
      stockCode,
      name,
      category,
      subCategory,
      tradingCurrency,
      rmbCounter
    });
  }

  return rows;
}

function getWorkbookEntryText(workbook: WorkbookWithFiles, path: string): string {
  const entry = workbook.files?.[path]?.content;
  if (!entry) {
    throw new Error(`Workbook is missing required entry: ${path}`);
  }

  if (typeof entry === 'string') {
    return entry;
  }

  return Buffer.from(entry).toString('utf8');
}

function parseSharedStrings(sharedStringsXml: string): string[] {
  const strings: string[] = [];
  for (const match of sharedStringsXml.matchAll(/<[^:>]*:?si\b[^>]*>([\s\S]*?)<\/[^:>]*:?si>/g)) {
    const fragment = match[1] ?? '';
    const textParts = [...fragment.matchAll(/<[^:>]*:?t\b[^>]*>([\s\S]*?)<\/[^:>]*:?t>/g)].map(
      (textMatch) => decodeXmlEntities(textMatch[1] ?? '')
    );
    strings.push(textParts.join(''));
  }

  return strings;
}

function parseWorksheetCellMap(rowXml: string, sharedStrings: string[]): Map<string, string> {
  const values = new Map<string, string>();

  for (const cellMatch of rowXml.matchAll(/<[^:>]*:?c\b([^>]*)>([\s\S]*?)<\/[^:>]*:?c>/g)) {
    const attributes = cellMatch[1] ?? '';
    const innerXml = cellMatch[2] ?? '';
    const refMatch = attributes.match(/\br="([A-Z]+)\d+"/);
    if (!refMatch) {
      continue;
    }

    const cellType = attributes.match(/\bt="([^"]+)"/)?.[1] ?? null;
    values.set(refMatch[1]!, extractCellText(innerXml, cellType, sharedStrings));
  }

  return values;
}

function extractCellText(
  innerXml: string,
  cellType: string | null,
  sharedStrings: string[]
): string {
  if (cellType === 's') {
    const rawIndex = innerXml.match(/<[^:>]*:?v\b[^>]*>([\s\S]*?)<\/[^:>]*:?v>/)?.[1] ?? '';
    const index = Number.parseInt(rawIndex, 10);
    return Number.isFinite(index) ? sharedStrings[index] ?? '' : '';
  }

  const inlineText = [...innerXml.matchAll(/<[^:>]*:?t\b[^>]*>([\s\S]*?)<\/[^:>]*:?t>/g)]
    .map((match) => decodeXmlEntities(match[1] ?? ''))
    .join('');
  if (inlineText) {
    return inlineText;
  }

  const rawValue = innerXml.match(/<[^:>]*:?v\b[^>]*>([\s\S]*?)<\/[^:>]*:?v>/)?.[1] ?? '';
  return decodeXmlEntities(rawValue);
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([\da-fA-F]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

async function loadCachedHistories(
  csvPath: string,
  allowedSymbols: Set<string>
): Promise<Map<string, SymbolHistory>> {
  const histories = new Map<string, SymbolHistory>();
  if (!existsSync(csvPath)) {
    return histories;
  }

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
    if (!allowedSymbols.has(symbol)) {
      continue;
    }

    const adjClose = Number(parts[2] ?? '');
    const volumeText = hasVolume ? parts[3] ?? '' : '';
    const history = histories.get(symbol) ?? {
      symbol,
      name: symbol,
      prices: [],
      lastTradeDate: ''
    };

    history.prices.push({
      tradeDate,
      adjClose,
      volume: volumeText ? BigInt(volumeText) : null
    });
    history.lastTradeDate = tradeDate;
    histories.set(symbol, history);
  }

  return histories;
}

async function loadCachedTaxonomy(
  taxonomyPath: string,
  allowedSymbols: Set<string>
): Promise<Map<string, SecurityTaxonomySnapshot>> {
  const snapshots = new Map<string, SecurityTaxonomySnapshot>();

  if (!existsSync(taxonomyPath)) {
    return snapshots;
  }

  const raw = await readFile(taxonomyPath, 'utf8');
  const parsed = JSON.parse(raw) as SecurityTaxonomySnapshot[];

  for (const snapshot of parsed) {
    if (!allowedSymbols.has(snapshot.symbol)) {
      continue;
    }

    snapshots.set(snapshot.symbol, snapshot);
  }

  return snapshots;
}

async function refreshOfficialTaxonomy(
  officialEquities: OfficialSecurity[],
  cachedSnapshots: Map<string, SecurityTaxonomySnapshot>
): Promise<TaxonomyRefreshOutcome> {
  const snapshots = await mapConcurrent(
    officialEquities,
    FETCH_CONCURRENCY,
    async (official) => {
      const cached = cachedSnapshots.get(official.symbol);
      if (cached?.broadSector || cached?.rawSector || cached?.rawIndustry) {
        return {
          ...cached,
          broadSector:
            cached.broadSector ??
            mapYahooTaxonomyToBroadSector(cached.rawSector, cached.rawIndustry) ??
            inferBroadSectorFromName([official.name, cached.shortName]),
          source: 'cache' as const
        };
      }

      return fetchSecurityTaxonomy(official);
    },
    (completed) => {
      if (completed % 200 === 0 || completed === officialEquities.length) {
        console.log(`Resolved taxonomy for ${completed}/${officialEquities.length} official HK symbols.`);
      }
    }
  );

  return {
    snapshots: snapshots.sort((left, right) => left.symbol.localeCompare(right.symbol)),
    reusedSnapshotCount: snapshots.filter((snapshot) => snapshot.source === 'cache').length,
    fetchedSnapshotCount: snapshots.filter((snapshot) => snapshot.source !== 'cache').length
  };
}

async function fetchSecurityTaxonomy(
  official: OfficialSecurity
): Promise<SecurityTaxonomySnapshot> {
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(buildYahooSearchUrl(official.symbol), {
        headers: {
          accept: 'application/json',
          'user-agent': 'Mozilla/5.0 RiskAtlasTaxonomy/1.0'
        }
      });

      if (response.status === 429) {
        await wait(300 * attempt);
        continue;
      }

      if (!response.ok) {
        break;
      }

      const payload = (await response.json()) as YahooSearchResponse;
      const quote = selectYahooSearchQuote(payload, official.symbol);
      const shortName = sanitizeNullableString(quote?.shortname ?? quote?.longname ?? null);
      const rawSector = sanitizeNullableString(quote?.sectorDisp ?? quote?.sector ?? null);
      const rawIndustry = sanitizeNullableString(quote?.industryDisp ?? quote?.industry ?? null);
      const broadSector =
        mapYahooTaxonomyToBroadSector(rawSector, rawIndustry) ??
        inferBroadSectorFromName([official.name, shortName]);

      return {
        symbol: official.symbol,
        shortName,
        rawSector,
        rawIndustry,
        broadSector,
        source:
          rawSector || rawIndustry
            ? 'yahoo_search'
            : broadSector
              ? 'name_heuristic'
              : 'unmapped'
      };
    } catch {
      await wait(200 * attempt);
    }
  }

  return {
    symbol: official.symbol,
    shortName: null,
    rawSector: null,
    rawIndustry: null,
    broadSector: inferBroadSectorFromName([official.name]),
    source: inferBroadSectorFromName([official.name]) ? 'name_heuristic' : 'unmapped'
  };
}

function buildYahooSearchUrl(query: string): string {
  return `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}`;
}

function selectYahooSearchQuote(
  payload: YahooSearchResponse,
  symbol: string
): YahooSearchQuote | null {
  const quotes = payload.quotes ?? [];
  const exactMatch = quotes.find((entry) => entry.symbol?.toUpperCase() === symbol.toUpperCase());
  if (exactMatch) {
    return exactMatch;
  }

  return (
    quotes.find(
      (entry) =>
        entry.exchange === 'HKG' &&
        (entry.quoteType === 'EQUITY' || entry.typeDisp?.toLowerCase() === 'equity')
    ) ?? null
  );
}

function sanitizeNullableString(value: string | null | undefined): string | null {
  const nextValue = value?.trim();
  return nextValue ? nextValue : null;
}

function mapYahooTaxonomyToBroadSector(
  rawSector: string | null,
  rawIndustry: string | null
): Sector | null {
  const sector = normalizeTaxonomyValue(rawSector);
  const industry = normalizeTaxonomyValue(rawIndustry);

  if (sector.includes('financial')) {
    return 'financials';
  }

  if (sector.includes('real estate')) {
    return 'property';
  }

  if (sector.includes('utilities')) {
    return 'utilities';
  }

  if (sector.includes('energy')) {
    return 'energy';
  }

  if (sector.includes('consumer')) {
    return 'consumer';
  }

  if (sector.includes('industrial') || sector.includes('basic materials')) {
    return 'industrial';
  }

  if (sector.includes('technology') || sector.includes('healthcare')) {
    return 'tech';
  }

  if (sector.includes('communication services')) {
    if (industry.includes('telecom')) {
      return 'telecom';
    }

    return 'tech';
  }

  if (matchesKeyword(industry, ['bank', 'insurance', 'capital market', 'asset management', 'financial', 'stock exchange', 'credit'])) {
    return 'financials';
  }

  if (matchesKeyword(industry, ['reit', 'real estate', 'property'])) {
    return 'property';
  }

  if (matchesKeyword(industry, ['telecom', 'wireless'])) {
    return 'telecom';
  }

  if (matchesKeyword(industry, ['oil', 'petroleum', 'coal', 'solar', 'renewable', 'exploration'])) {
    return 'energy';
  }

  if (matchesKeyword(industry, ['utility', 'electric', 'water'])) {
    return 'utilities';
  }

  if (matchesKeyword(industry, ['beverage', 'food', 'apparel', 'gaming', 'travel', 'retail', 'restaurant', 'hotel', 'lodging', 'household', 'packaged'])) {
    return 'consumer';
  }

  if (matchesKeyword(industry, ['biotech', 'pharmaceutical', 'medical', 'health', 'software', 'internet', 'semiconductor', 'electronics', 'information', 'digital'])) {
    return 'tech';
  }

  if (matchesKeyword(industry, ['auto', 'vehicle', 'shipping', 'port', 'logistics', 'construction', 'engineering', 'machinery', 'rail', 'airline', 'airport', 'manufacturing', 'industrial'])) {
    return 'industrial';
  }

  return null;
}

function inferBroadSectorFromName(labels: Array<string | null | undefined>): Sector | null {
  const normalized = normalizeTaxonomyValue(labels.filter(Boolean).join(' '));

  if (matchesKeyword(normalized, ['bank', 'insurance', 'financial', 'securities', 'exchange', 'capital'])) {
    return 'financials';
  }

  if (matchesKeyword(normalized, ['property', 'real estate', 'land', 'reit'])) {
    return 'property';
  }

  if (matchesKeyword(normalized, ['telecom', 'mobile', 'unicom', 'communications'])) {
    return 'telecom';
  }

  if (matchesKeyword(normalized, ['utility', 'power', 'electric', 'water', 'gas'])) {
    return 'utilities';
  }

  if (matchesKeyword(normalized, ['oil', 'petroleum', 'coal', 'energy', 'solar'])) {
    return 'energy';
  }

  if (matchesKeyword(normalized, ['tech', 'technology', 'internet', 'biotech', 'pharma', 'pharmaceutical', 'health', 'healthcare', 'medical', 'electronics', 'digital'])) {
    return 'tech';
  }

  if (matchesKeyword(normalized, ['food', 'dairy', 'beer', 'sports', 'travel', 'retail', 'hotel', 'gaming', 'entertainment', 'beverage', 'consumer'])) {
    return 'consumer';
  }

  if (matchesKeyword(normalized, ['auto', 'automobile', 'rail', 'shipping', 'port', 'logistics', 'construction', 'engineering', 'cement', 'infrastructure', 'glass', 'industrial', 'airline', 'airport'])) {
    return 'industrial';
  }

  return null;
}

function normalizeTaxonomyValue(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[—–-]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesKeyword(value: string, fragments: string[]): boolean {
  return fragments.some((fragment) => value.includes(fragment));
}

async function writeSecurityTaxonomyJson(
  snapshots: SecurityTaxonomySnapshot[],
  outputPath: string
): Promise<void> {
  await writeFile(outputPath, `${JSON.stringify(snapshots, null, 2)}\n`, 'utf8');
}

async function refreshOfficialUniverseHistories(
  officialEquities: OfficialSecurity[],
  cachedHistories: Map<string, SymbolHistory>
): Promise<RefreshOutcome> {
  const acceptedHistories = new Map<string, SymbolHistory>();
  const rejections: FetchRejection[] = [];
  let reusedSymbolCount = 0;
  let fetchedSymbolCount = 0;
  const activeMinLastTradeDate = computeActiveMinLastTradeDate(FETCH_END_DATE);

  const outcomes = await mapConcurrent(
    officialEquities,
    FETCH_CONCURRENCY,
    async (official) => {
      const cached = cachedHistories.get(official.symbol) ?? null;

      if (cached && cached.prices.length >= MIN_REQUIRED_PRICE_ROWS) {
        reusedSymbolCount += 1;

        if (cached.lastTradeDate >= FETCH_END_DATE) {
          return {
            history: {
              symbol: official.symbol,
              name: official.name,
              prices: cached.prices,
              lastTradeDate: cached.lastTradeDate
            },
            rejection: null as FetchRejection | null
          };
        }
      }

      fetchedSymbolCount += 1;
      return fetchSymbolHistory(official, activeMinLastTradeDate, cached);
    },
    (completed) => {
      if (completed % 100 === 0 || completed === officialEquities.length) {
        console.log(
          `Processed ${completed}/${officialEquities.length} official HK symbols. ` +
            `Reused cached bases ${reusedSymbolCount}, fetched source windows ${fetchedSymbolCount}.`
        );
      }
    }
  );

  for (const outcome of outcomes) {
    if (outcome.history) {
      acceptedHistories.set(outcome.history.symbol, outcome.history);
    }

    if (outcome.rejection) {
      rejections.push(outcome.rejection);
    }
  }

  return {
    acceptedHistories: [...acceptedHistories.values()].sort((left, right) =>
      left.symbol.localeCompare(right.symbol)
    ),
    rejections,
    officialEquities,
    reusedSymbolCount,
    fetchedSymbolCount
  };
}

async function fetchSymbolHistory(
  official: OfficialSecurity,
  activeMinLastTradeDate: string,
  cachedHistory: SymbolHistory | null
): Promise<{ history: SymbolHistory | null; rejection: FetchRejection | null }> {
  const fetchStartDate = deriveIncrementalFetchStartDate(cachedHistory?.lastTradeDate ?? null);
  const url = buildYahooChartUrl(official.symbol, fetchStartDate, FETCH_END_DATE);

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'Mozilla/5.0 RiskAtlasBenchmark/2.0'
        }
      });

      if (response.status === 429) {
        await wait(300 * attempt);
        continue;
      }

      if (!response.ok) {
        return fallbackOrReject(official, cachedHistory, activeMinLastTradeDate, 'request_failed');
      }

      const payload = (await response.json()) as YahooChartResponse;
      const result = payload.chart?.result?.[0];
      if (!result?.meta) {
        return fallbackOrReject(official, cachedHistory, activeMinLastTradeDate, 'missing_payload');
      }

      if (result.meta.exchangeName !== 'HKG' || result.meta.instrumentType !== 'EQUITY') {
        return fallbackOrReject(official, cachedHistory, activeMinLastTradeDate, 'not_hkg_equity');
      }

      const timestamps = result.timestamp ?? [];
      const adjCloses = result.indicators?.adjclose?.[0]?.adjclose ?? [];
      const volumes = result.indicators?.quote?.[0]?.volume ?? [];

      const fetchedPrices: PricePoint[] = [];
      for (let index = 0; index < timestamps.length; index += 1) {
        const timestamp = timestamps[index];
        const adjClose = adjCloses[index];

        if (!timestamp || !Number.isFinite(adjClose) || (adjClose ?? 0) <= 0) {
          continue;
        }

        const volume = volumes[index];
        fetchedPrices.push({
          tradeDate: new Date(timestamp * 1000).toISOString().slice(0, 10),
          adjClose: Number(adjClose),
          volume:
            Number.isFinite(volume) && (volume ?? 0) >= 0 ? BigInt(Math.round(volume!)) : null
        });
      }

      const prices = mergePricePoints(cachedHistory?.prices ?? [], fetchedPrices);

      if (prices.length < MIN_REQUIRED_PRICE_ROWS) {
        return fallbackOrReject(official, cachedHistory, activeMinLastTradeDate, 'insufficient_history');
      }

      const lastTradeDate = prices[prices.length - 1]?.tradeDate ?? '';
      if (!lastTradeDate || lastTradeDate < activeMinLastTradeDate) {
        return fallbackOrReject(official, cachedHistory, activeMinLastTradeDate, 'inactive');
      }

      return {
        history: {
          symbol: official.symbol,
          name: official.name,
          prices,
          lastTradeDate
        },
        rejection: null
      };
    } catch {
      if (attempt === MAX_FETCH_ATTEMPTS) {
        return fallbackOrReject(official, cachedHistory, activeMinLastTradeDate, 'request_failed');
      }

      await wait(200 * attempt);
    }
  }

  return fallbackOrReject(official, cachedHistory, activeMinLastTradeDate, 'request_failed');
}

function fallbackOrReject(
  official: OfficialSecurity,
  cachedHistory: SymbolHistory | null,
  activeMinLastTradeDate: string,
  reason: FetchRejectionReason
): { history: SymbolHistory | null; rejection: FetchRejection | null } {
  if (canReuseCachedHistory(cachedHistory, activeMinLastTradeDate)) {
    return {
      history: {
        symbol: official.symbol,
        name: official.name,
        prices: cachedHistory.prices,
        lastTradeDate: cachedHistory.lastTradeDate
      },
      rejection: null
    };
  }

  return {
    history: null,
    rejection: {
      symbol: official.symbol,
      name: official.name,
      reason
    }
  };
}

function canReuseCachedHistory(
  cachedHistory: SymbolHistory | null,
  activeMinLastTradeDate: string
): cachedHistory is SymbolHistory {
  return Boolean(
    cachedHistory &&
      cachedHistory.prices.length >= MIN_REQUIRED_PRICE_ROWS &&
      cachedHistory.lastTradeDate >= activeMinLastTradeDate
  );
}

function mergePricePoints(existingPrices: PricePoint[], refreshedPrices: PricePoint[]): PricePoint[] {
  const byTradeDate = new Map(existingPrices.map((price) => [price.tradeDate, price] as const));

  for (const price of refreshedPrices) {
    byTradeDate.set(price.tradeDate, price);
  }

  return [...byTradeDate.values()].sort((left, right) => left.tradeDate.localeCompare(right.tradeDate));
}

function deriveIncrementalFetchStartDate(lastTradeDate: string | null): string {
  if (!lastTradeDate) {
    return FETCH_START_DATE;
  }

  const overlapDays = Number.isFinite(SOURCE_REFRESH_OVERLAP_DAYS) && SOURCE_REFRESH_OVERLAP_DAYS > 0
    ? SOURCE_REFRESH_OVERLAP_DAYS
    : 45;
  const candidate = shiftIsoDate(lastTradeDate, -overlapDays);
  return candidate > FETCH_START_DATE ? candidate : FETCH_START_DATE;
}

function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

async function upsertSecurityMaster(
  officialEquities: OfficialSecurity[],
  taxonomySnapshots: SecurityTaxonomySnapshot[]
): Promise<void> {
  console.log(
    `Upserting ${officialEquities.length} official HK common-equity entries into security_master.`
  );

  const taxonomyBySymbol = new Map(
    taxonomySnapshots.map((snapshot) => [snapshot.symbol, snapshot] as const)
  );

  for (const official of officialEquities) {
    const taxonomy = taxonomyBySymbol.get(official.symbol);
    await prisma.securityMaster.upsert({
      where: { symbol: official.symbol },
      update: {
        name: official.name,
        shortName: taxonomy?.shortName ?? undefined,
        securityType: SecurityType.common_equity,
        ...(taxonomy?.broadSector ? { sector: taxonomy.broadSector } : {}),
        market: Market.HK
      },
      create: {
        symbol: official.symbol,
        name: official.name,
        shortName: taxonomy?.shortName ?? null,
        securityType: SecurityType.common_equity,
        sector: taxonomy?.broadSector ?? null,
        market: Market.HK
      }
    });
  }
}

async function writeNormalizedCsv(histories: SymbolHistory[], outputPath: string): Promise<void> {
  await mkdir(resolve(outputPath, '..'), { recursive: true });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const stream = createWriteStream(outputPath, { encoding: 'utf8' });
    stream.on('error', rejectPromise);
    stream.on('finish', () => resolvePromise());
    stream.write('tradeDate,symbol,adjClose,volume\n');

    for (const history of histories) {
      const sortedPrices = [...history.prices].sort((left, right) =>
        left.tradeDate.localeCompare(right.tradeDate)
      );
      for (const price of sortedPrices) {
        stream.write(
          `${price.tradeDate},${history.symbol},${price.adjClose.toFixed(6)},${price.volume?.toString() ?? ''}\n`
        );
      }
    }

    stream.end();
  });
}

async function writeAcceptedSymbolsJson(histories: SymbolHistory[], outputPath: string): Promise<void> {
  await writeFile(
    outputPath,
    JSON.stringify(
      histories.map((entry) => ({
        symbol: entry.symbol,
        name: entry.name,
        lastTradeDate: entry.lastTradeDate,
        rowCount: entry.prices.length
      })),
      null,
      2
    )
  );
}

function buildHistoryDatasetSummary(
  histories: SymbolHistory[]
): Pick<
  ImportEodCsvSummary,
  'rowCount' | 'symbolCount' | 'minTradeDate' | 'maxTradeDate' | 'firstValidAsOfByWindowDays'
> {
  let rowCount = 0;
  let minTradeDate: string | null = null;
  let maxTradeDate: string | null = null;
  const tradeDates = new Set<string>();

  for (const history of histories) {
    for (const price of history.prices) {
      rowCount += 1;
      tradeDates.add(price.tradeDate);

      if (minTradeDate === null || price.tradeDate < minTradeDate) {
        minTradeDate = price.tradeDate;
      }

      if (maxTradeDate === null || price.tradeDate > maxTradeDate) {
        maxTradeDate = price.tradeDate;
      }
    }
  }

  if (rowCount === 0 || minTradeDate === null || maxTradeDate === null) {
    throw new Error('HK refresh produced no accepted price rows to summarize.');
  }

  const sortedTradeDates = [...tradeDates].sort((left, right) => left.localeCompare(right));

  return {
    rowCount,
    symbolCount: histories.length,
    minTradeDate,
    maxTradeDate,
    firstValidAsOfByWindowDays: {
      '60': sortedTradeDates[60] ?? null,
      '120': sortedTradeDates[120] ?? null,
      '252': sortedTradeDates[252] ?? null
    }
  };
}

function buildIncrementalImportPlan(
  histories: SymbolHistory[],
  cachedHistories: Map<string, SymbolHistory>
): IncrementalImportPlan {
  const mergeStartDateBySymbol = new Map<string, string>();
  let rowCount = 0;

  for (const history of histories) {
    const earliestChangedTradeDate = findEarliestChangedTradeDate(
      history,
      cachedHistories.get(history.symbol) ?? null
    );

    if (!earliestChangedTradeDate) {
      continue;
    }

    mergeStartDateBySymbol.set(history.symbol, earliestChangedTradeDate);
    rowCount += history.prices.filter((price) => price.tradeDate >= earliestChangedTradeDate).length;
  }

  return {
    mergeStartDateBySymbol,
    symbolCount: mergeStartDateBySymbol.size,
    rowCount
  };
}

function findEarliestChangedTradeDate(
  history: SymbolHistory,
  cachedHistory: SymbolHistory | null
): string | null {
  if (!cachedHistory) {
    return history.prices[0]?.tradeDate ?? null;
  }

  const cachedPricesByTradeDate = new Map(
    cachedHistory.prices.map((price) => [price.tradeDate, price] as const)
  );

  for (const price of history.prices) {
    const cachedPrice = cachedPricesByTradeDate.get(price.tradeDate);

    if (!cachedPrice || !samePricePoint(cachedPrice, price)) {
      return price.tradeDate;
    }
  }

  return null;
}

function samePricePoint(left: PricePoint, right: PricePoint): boolean {
  return left.adjClose === right.adjClose && (left.volume ?? null) === (right.volume ?? null);
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

async function runBenchmarks(
  asOfDate: string,
  plans: ReadonlyArray<(typeof BENCHMARK_PLANS)[number]>
): Promise<BenchmarkEntry[]> {
  const entries: BenchmarkEntry[] = [];

  for (const plan of plans) {
    const buildRun = await prisma.buildRun.create({
      data: {
        datasetId: DATASET_ID,
        universeId: plan.universeId,
        asOfDate,
        windowDays: WINDOW_DAYS,
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
      universeName: plan.universeName,
      requestedSymbolCount: plan.requestedSymbolCount,
      buildRunId: buildRun.id,
      status: completed.status,
      durationMs:
        completed.finishedAt && completed.startedAt
          ? completed.finishedAt.getTime() - completed.startedAt.getTime()
          : elapsedMs,
      matrixByteSize: completed.artifact?.matrixByteSize
        ? Number(completed.artifact.matrixByteSize)
        : null,
      previewByteSize: completed.artifact?.previewByteSize
        ? Number(completed.artifact.previewByteSize)
        : null,
      manifestByteSize: completed.artifact?.manifestByteSize
        ? Number(completed.artifact.manifestByteSize)
        : null,
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
    orderBy: [{ symbol: 'asc' }, { tradeDate: 'asc' }],
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

function computeActiveMinLastTradeDate(fetchEndDate: string): string {
  const date = new Date(`${fetchEndDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 30);
  return date.toISOString().slice(0, 10);
}

function buildCoverageReport(args: {
  officialEquities: OfficialSecurity[];
  refreshOutcome: RefreshOutcome;
  taxonomyOutcome: TaxonomyRefreshOutcome;
  activeMinLastTradeDate: string;
  importSummary: Awaited<ReturnType<typeof importEodCsv>>;
  coverageAssessment: Awaited<ReturnType<typeof assessBuildRequestCoverage>>;
  validation: Awaited<ReturnType<typeof getBuildRequestValidationForResolvedUniverse>>;
  alignmentAudit: Awaited<ReturnType<typeof measureAlignmentAudit>>;
  benchmarkEligibleSymbols: string[];
  benchmarkPlans: ReadonlyArray<(typeof BENCHMARK_PLANS)[number]>;
  benchmarks: BenchmarkEntry[];
  alignmentAuditSkipped: boolean;
}): RealCoverageReport {
  const rejectionBreakdown = args.refreshOutcome.rejections.reduce<Record<string, number>>(
    (acc, entry) => {
      acc[entry.reason] = (acc[entry.reason] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const officialCommonEquityCount = args.officialEquities.length;
  const coverageQualifiedSymbolCount = args.coverageAssessment.coverageQualifiedSymbols.length;
  const matrixReadySymbolCount = args.coverageAssessment.matrixReadySymbols.length;
  const sourceBreakdown = args.taxonomyOutcome.snapshots.reduce<Record<string, number>>((acc, snapshot) => {
    acc[snapshot.source] = (acc[snapshot.source] ?? 0) + 1;
    return acc;
  }, {});
  const broadSectorMappedCount = args.taxonomyOutcome.snapshots.filter(
    (snapshot) => snapshot.broadSector !== null
  ).length;
  const rawSectorCount = args.taxonomyOutcome.snapshots.filter(
    (snapshot) => snapshot.rawSector !== null
  ).length;
  const rawIndustryCount = args.taxonomyOutcome.snapshots.filter(
    (snapshot) => snapshot.rawIndustry !== null
  ).length;

  return {
    source: 'hkex_official_list + yahoo_chart_api + yahoo_search_taxonomy',
    generatedAt: new Date().toISOString(),
    officialUniverse: {
      sourceUrl: HKEX_FULL_LIST_URL,
      workbookPath: OUTPUT_HKEX_WORKBOOK_PATH,
      filteredSymbolCount: officialCommonEquityCount,
      filter: {
        category: 'Equity',
        subCategories: [...OFFICIAL_EQUITY_SUBCATEGORIES],
        tradingCurrency: 'HKD',
        excludeRmbCounter: true
      }
    },
    fetch: {
      startDate: FETCH_START_DATE,
      endDate: FETCH_END_DATE,
      activeMinLastTradeDate: args.activeMinLastTradeDate,
      reusedSymbolCount: args.refreshOutcome.reusedSymbolCount,
      fetchedSymbolCount: args.refreshOutcome.fetchedSymbolCount,
      acceptedSymbolCount: args.refreshOutcome.acceptedHistories.length,
      rejectedSymbolCount: args.refreshOutcome.rejections.length,
      rejectionBreakdown,
      sampleRejectedSymbols: args.refreshOutcome.rejections.slice(0, 100),
      csvPath: OUTPUT_CSV_PATH,
      symbolsPath: OUTPUT_SYMBOLS_PATH
    },
    dataset: {
      datasetId: args.importSummary.datasetId,
      datasetName: args.importSummary.datasetName,
      rowCount: args.importSummary.rowCount,
      symbolCount: args.importSummary.symbolCount,
      minTradeDate: args.importSummary.minTradeDate,
      maxTradeDate: args.importSummary.maxTradeDate
    },
    taxonomy: {
      taxonomyPath: OUTPUT_TAXONOMY_PATH,
      reusedSnapshotCount: args.taxonomyOutcome.reusedSnapshotCount,
      fetchedSnapshotCount: args.taxonomyOutcome.fetchedSnapshotCount,
      broadSectorMappedCount,
      broadSectorMappedRate: roundRatio(broadSectorMappedCount, officialCommonEquityCount),
      rawSectorCount,
      rawIndustryCount,
      sourceBreakdown,
      sampleUnmappedSymbols: args.taxonomyOutcome.snapshots
        .filter((snapshot) => snapshot.broadSector === null)
        .slice(0, 100)
        .map((snapshot) => ({
          symbol: snapshot.symbol,
          shortName: snapshot.shortName,
          rawSector: snapshot.rawSector,
          rawIndustry: snapshot.rawIndustry
        }))
    },
    coverageAudit: {
      targetDate: args.importSummary.maxTradeDate,
      requiredRows: WINDOW_DAYS + 1,
      officialCommonEquityCount,
      datasetImportedSymbolCount: args.importSummary.symbolCount,
      coverageQualifiedSymbolCount,
      matrixReadySymbolCount,
      filteredOutSymbolCount: args.coverageAssessment.filteredOutSymbols.length,
      coverageQualifiedRate: roundRatio(coverageQualifiedSymbolCount, officialCommonEquityCount),
      matrixReadyRate: roundRatio(matrixReadySymbolCount, officialCommonEquityCount),
      latestWindowTradeDateCount: args.alignmentAudit.latestWindowTradeDateCount,
      latestWindowFullSymbolCount: args.alignmentAudit.latestWindowFullSymbolCount,
      latestWindowFullRate: roundRatio(
        args.alignmentAudit.latestWindowFullSymbolCount,
        officialCommonEquityCount
      ),
      sharedAlignedTradeDateCountAcrossCoverageQualified:
        args.alignmentAudit.sharedAlignedTradeDateCountAcrossCoverageQualified,
      alignmentAuditSkipped: args.alignmentAuditSkipped,
      currentValidation: {
        valid: args.validation.valid,
        reasonCode: args.validation.reasonCode,
        message: args.validation.message
      }
    },
    benchmarkEligibility: {
      varianceEligibleSymbolCount: args.benchmarkEligibleSymbols.length,
      requestedUniversePlans: args.benchmarkPlans.map((plan) => ({
        universeId: plan.universeId,
        universeName: plan.universeName,
        requestedSymbolCount: plan.requestedSymbolCount
      }))
    },
    benchmarks: args.benchmarks
  };
}

function roundRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 10000) / 10000;
}

async function measureAlignmentAudit(args: {
  datasetId: string;
  asOfDate: string;
  requiredRows: number;
}): Promise<{
  latestWindowTradeDateCount: number;
  latestWindowFullSymbolCount: number;
  sharedAlignedTradeDateCountAcrossCoverageQualified: number;
}> {
  const [latestWindowRow, sharedAlignedRow] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        tradeDateCount: bigint | number;
        fullSymbolCount: bigint | number;
      }>
    >(Prisma.sql`
      WITH target_window AS (
        SELECT "tradeDate"
        FROM eod_prices
        WHERE "datasetId" = ${args.datasetId}
          AND "tradeDate" <= ${args.asOfDate}
        GROUP BY "tradeDate"
        ORDER BY "tradeDate" DESC
        LIMIT ${args.requiredRows}
      ),
      symbol_target_window AS (
        SELECT p.symbol
        FROM eod_prices p
        JOIN target_window d ON d."tradeDate" = p."tradeDate"
        WHERE p."datasetId" = ${args.datasetId}
        GROUP BY p.symbol
        HAVING COUNT(DISTINCT p."tradeDate") = ${args.requiredRows}
      )
      SELECT
        (SELECT COUNT(*) FROM target_window) AS "tradeDateCount",
        COUNT(*) AS "fullSymbolCount"
      FROM symbol_target_window
    `),
    prisma.$queryRaw<Array<{ alignedDateCount: bigint | number }>>(Prisma.sql`
      WITH eligible_symbols AS (
        SELECT symbol
        FROM eod_prices
        WHERE "datasetId" = ${args.datasetId}
          AND "tradeDate" <= ${args.asOfDate}
        GROUP BY symbol
        HAVING COUNT(*) >= ${args.requiredRows}
      ),
      aligned_dates AS (
        SELECT p."tradeDate"
        FROM eod_prices p
        JOIN eligible_symbols s ON s.symbol = p.symbol
        WHERE p."datasetId" = ${args.datasetId}
          AND p."tradeDate" <= ${args.asOfDate}
        GROUP BY p."tradeDate"
        HAVING COUNT(DISTINCT p.symbol) = (SELECT COUNT(*) FROM eligible_symbols)
      )
      SELECT COUNT(*) AS "alignedDateCount"
      FROM aligned_dates
    `)
  ]);

  return {
    latestWindowTradeDateCount: Number(latestWindowRow?.[0]?.tradeDateCount ?? 0),
    latestWindowFullSymbolCount: Number(latestWindowRow?.[0]?.fullSymbolCount ?? 0),
    sharedAlignedTradeDateCountAcrossCoverageQualified: Number(
      sharedAlignedRow?.[0]?.alignedDateCount ?? 0
    )
  };
}

function buildYahooChartUrl(symbol: string, startDate: string, endDate: string): string {
  const period1 = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000);
  const period2 = Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000);

  return `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d&includeAdjustedClose=true&events=div%2Csplits`;
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

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
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

type YahooSearchQuote = {
  symbol?: string;
  exchange?: string;
  quoteType?: string;
  typeDisp?: string;
  shortname?: string;
  longname?: string;
  sector?: string;
  sectorDisp?: string;
  industry?: string;
  industryDisp?: string;
};

type YahooSearchResponse = {
  quotes?: YahooSearchQuote[];
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main()
    .catch((error) => {
      console.error('Real HK benchmark failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
