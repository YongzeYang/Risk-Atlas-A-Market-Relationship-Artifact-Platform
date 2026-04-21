// apps/api/prisma/seed.ts
import 'dotenv/config';

import { scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatasetSource, Market, Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

import {
  DEMO_DATASET_ID,
  DEMO_DATASET_NAME,
  HK_SYMBOL_PATTERN,
  MIN_REQUIRED_PRICE_ROWS,
  SEED_UNIVERSES,
  SECURITY_MASTER,
  SEED_INVITE_CODES,
  SEED_INVITE_SALT,
  type SeedUniverse
} from './mvp-config.js';
import { writeDeterministicHkEodDemoCsv, DEFAULT_DEMO_CSV_PATH } from './generate-sample-eod.js';
import { importEodCsv } from './import-eod.js';

const REAL_HK_DATASET_ID = 'hk_eod_yahoo_real_v1';
const REAL_HK_DATASET_NAME = 'Hong Kong EOD Real Yahoo Chart v1';
const DEFAULT_REAL_HK_CSV_PATH = fileURLToPath(
  new URL('../../../data/real-hk/hk_eod_yahoo_real_v1.csv', import.meta.url)
);
const REAL_HK_IMPORT_TRANSACTION_TIMEOUT_MS = 1_800_000;

type SeedDatasetTarget = {
  datasetId: string;
  datasetName: string;
  csvPath: string;
  needsGeneration: boolean;
};

type StaticUniverseCoverageIssue = {
  universeId: string;
  missing: string[];
  insufficient: Array<{
    symbol: string;
    rowCount: number;
  }>;
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not defined in the environment.');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function normalizeAndValidateSymbols(symbols: string[]): string[] {
  const normalized = symbols.map((s) => s.trim().toUpperCase());

  if (normalized.length === 0) {
    throw new Error('Universe cannot be empty.');
  }

  if (normalized.length > 50) {
    throw new Error(`Universe exceeds max size 50. Got ${normalized.length}.`);
  }

  const unique = new Set(normalized);
  if (unique.size !== normalized.length) {
    throw new Error('Universe contains duplicate symbols.');
  }

  for (const symbol of normalized) {
    if (!HK_SYMBOL_PATTERN.test(symbol)) {
      throw new Error(
        `Invalid Hong Kong symbol format: "${symbol}". Expected zero-padded format like 0700.HK.`
      );
    }
  }

  return normalized;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error('Expected symbolsJson to be a JSON string array.');
  }

  return value as string[];
}

async function upsertUniverse(universe: SeedUniverse) {
  const isStatic = universe.definitionKind === 'static';

  let symbols: string[] | null = null;
  if (isStatic && universe.symbols) {
    symbols = normalizeAndValidateSymbols(universe.symbols);
  }

  await prisma.universe.upsert({
    where: { id: universe.id },
    update: {
      name: universe.name,
      market: Market.HK,
      symbolsJson: symbols ? (symbols as Prisma.InputJsonValue) : Prisma.JsonNull,
      symbolCount: symbols ? symbols.length : null,
      definitionKind: universe.definitionKind,
      definitionParams: universe.definitionParams
        ? (universe.definitionParams as Prisma.InputJsonValue)
        : Prisma.JsonNull
    },
    create: {
      id: universe.id,
      name: universe.name,
      market: Market.HK,
      symbolsJson: symbols ? (symbols as Prisma.InputJsonValue) : Prisma.JsonNull,
      symbolCount: symbols ? symbols.length : null,
      definitionKind: universe.definitionKind,
      definitionParams: universe.definitionParams
        ? (universe.definitionParams as Prisma.InputJsonValue)
        : Prisma.JsonNull
    }
  });
}

async function upsertDataset(target: SeedDatasetTarget) {
  await prisma.dataset.upsert({
    where: {
      id: target.datasetId
    },
    update: {
      name: target.datasetName,
      source: DatasetSource.curated_csv,
      market: Market.HK
    },
    create: {
      id: target.datasetId,
      name: target.datasetName,
      source: DatasetSource.curated_csv,
      market: Market.HK
    }
  });
}

function resolveSeedDatasetTarget(): SeedDatasetTarget {
  if (existsSync(DEFAULT_REAL_HK_CSV_PATH)) {
    return {
      datasetId: REAL_HK_DATASET_ID,
      datasetName: REAL_HK_DATASET_NAME,
      csvPath: DEFAULT_REAL_HK_CSV_PATH,
      needsGeneration: false
    };
  }

  return {
    datasetId: DEMO_DATASET_ID,
    datasetName: DEMO_DATASET_NAME,
    csvPath: DEFAULT_DEMO_CSV_PATH,
    needsGeneration: true
  };
}

async function cleanupLegacyDemoDataset(activeDatasetId: string) {
  if (activeDatasetId === DEMO_DATASET_ID) {
    return;
  }

  await prisma.buildRun.deleteMany({
    where: {
      datasetId: DEMO_DATASET_ID
    }
  });

  await prisma.buildSeries.deleteMany({
    where: {
      datasetId: DEMO_DATASET_ID
    }
  });

  await prisma.eodPrice.deleteMany({
    where: {
      datasetId: DEMO_DATASET_ID
    }
  });

  await prisma.dataset.deleteMany({
    where: {
      id: DEMO_DATASET_ID
    }
  });
}

function formatCoverageIssue(issue: StaticUniverseCoverageIssue): string {
  return [
    `Dataset coverage validation failed for universe "${issue.universeId}".`,
    issue.missing.length > 0 ? `Missing symbols: ${issue.missing.join(', ')}` : null,
    issue.insufficient.length > 0
      ? `Insufficient price rows (< ${MIN_REQUIRED_PRICE_ROWS}): ${issue.insufficient
          .map((entry) => `${entry.symbol}(${entry.rowCount})`)
          .join(', ')}`
      : null
  ]
    .filter(Boolean)
    .join(' ');
}

async function assessStaticUniverseCoverage(
  datasetId: string,
  staticUniverseIds: string[]
): Promise<StaticUniverseCoverageIssue[]> {
  if (staticUniverseIds.length === 0) {
    return [];
  }

  const universes = await prisma.universe.findMany({
    where: {
      definitionKind: 'static',
      id: {
        in: staticUniverseIds
      }
    },
    orderBy: {
      id: 'asc'
    }
  });

  const issues: StaticUniverseCoverageIssue[] = [];

  for (const universe of universes) {
    const symbols = asStringArray(universe.symbolsJson);

    const counts = await prisma.eodPrice.groupBy({
      by: ['symbol'],
      where: {
        datasetId,
        symbol: {
          in: symbols
        }
      },
      _count: {
        _all: true
      }
    });

    const countsBySymbol = new Map(counts.map((row) => [row.symbol, row._count._all]));

    const missing = symbols.filter((symbol) => !countsBySymbol.has(symbol));
    const insufficient = symbols
      .map((symbol) => ({
        symbol,
        rowCount: countsBySymbol.get(symbol) ?? 0
      }))
      .filter((entry) => entry.rowCount < MIN_REQUIRED_PRICE_ROWS);

    if (missing.length > 0 || insufficient.length > 0) {
      issues.push({
        universeId: universe.id,
        missing,
        insufficient
      });
    }
  }

  return issues;
}

async function validateDatasetCoverage(datasetId: string, staticUniverseIds: string[]) {
  const issues = await assessStaticUniverseCoverage(datasetId, staticUniverseIds);

  if (issues.length > 0) {
    throw new Error(formatCoverageIssue(issues[0]!));
  }
}

async function seedSecurityMaster() {
  for (const entry of SECURITY_MASTER) {
    await prisma.securityMaster.upsert({
      where: { symbol: entry.symbol },
      update: {
        name: entry.name,
        shortName: entry.shortName ?? null,
        securityType: entry.securityType,
        sector: entry.sector ?? null,
        market: Market.HK
      },
      create: {
        symbol: entry.symbol,
        name: entry.name,
        shortName: entry.shortName ?? null,
        securityType: entry.securityType,
        sector: entry.sector ?? null,
        market: Market.HK
      }
    });
  }
}

function hashInviteCode(code: string): string {
  const hash = scryptSync(code, SEED_INVITE_SALT, 64).toString('hex');
  return `${SEED_INVITE_SALT}:${hash}`;
}

async function seedInviteCode() {
  for (const entry of SEED_INVITE_CODES) {
    const codeHash = hashInviteCode(entry.code);

    await prisma.inviteCode.upsert({
      where: { codeHash },
      update: {
        label: entry.label,
        active: true
      },
      create: {
        codeHash,
        label: entry.label,
        active: true,
        usesLeft: null
      }
    });
  }
}

async function main() {
  const seedDatasetTarget = resolveSeedDatasetTarget();

  await seedSecurityMaster();
  console.log(`Seeded ${SECURITY_MASTER.length} security master entries.`);

  for (const universe of SEED_UNIVERSES) {
    await upsertUniverse(universe);
  }

  await upsertDataset(seedDatasetTarget);

  if (seedDatasetTarget.needsGeneration) {
    const generationSummary = await writeDeterministicHkEodDemoCsv(seedDatasetTarget.csvPath);
    console.log(
      `Generated ${generationSummary.outputPath} with ${generationSummary.rowCount} rows ` +
        `(${generationSummary.symbolCount} symbols, ${generationSummary.minTradeDate}..${generationSummary.maxTradeDate}).`
    );
  } else {
    console.log(
      `Using local real-HK CSV seed source at ${seedDatasetTarget.csvPath}; ` +
        `demo sample regeneration is skipped.`
    );
    console.log('Starting real-HK dataset import. This can take several minutes on EC2.');
  }

  const importSummary = await importEodCsv({
    datasetId: seedDatasetTarget.datasetId,
    datasetName: seedDatasetTarget.datasetName,
    csvPath: seedDatasetTarget.csvPath,
    market: Market.HK,
    replaceExisting: true,
    prismaClient: prisma,
    transactionTimeoutMs: seedDatasetTarget.needsGeneration
      ? undefined
      : REAL_HK_IMPORT_TRANSACTION_TIMEOUT_MS
  });

  console.log(
    `Imported dataset ${importSummary.datasetId}: ${importSummary.rowCount} rows, ` +
      `${importSummary.symbolCount} symbols, ${importSummary.minTradeDate}..${importSummary.maxTradeDate}.`
  );

  await cleanupLegacyDemoDataset(seedDatasetTarget.datasetId);

  const staticUniverseIds = SEED_UNIVERSES.filter((universe) => universe.definitionKind === 'static').map(
    (universe) => universe.id
  );

  const coverageIssues = await assessStaticUniverseCoverage(
    seedDatasetTarget.datasetId,
    staticUniverseIds
  );

  const coveredStaticUniverseCount = staticUniverseIds.length - coverageIssues.length;

  if (seedDatasetTarget.datasetId === DEMO_DATASET_ID) {
    await validateDatasetCoverage(seedDatasetTarget.datasetId, staticUniverseIds);
  } else {
    console.log(
      `Static universe coverage for ${seedDatasetTarget.datasetId}: ` +
        `${coveredStaticUniverseCount}/${staticUniverseIds.length} fully covered.`
    );

    if (coverageIssues.length > 0) {
      console.warn(
        `Skipping strict coverage enforcement for unsupported static universes: ` +
          `${coverageIssues.map((issue) => issue.universeId).join(', ')}.`
      );
    }
  }

  await seedInviteCode();
  console.log(`Seeded ${SEED_INVITE_CODES.length} invite codes.`);

  const staticCount = SEED_UNIVERSES.filter((u) => u.definitionKind === 'static').length;
  const dynamicCount = SEED_UNIVERSES.length - staticCount;
  console.log(
    `Seed complete: ${SEED_UNIVERSES.length} universes (${staticCount} static, ${dynamicCount} dynamic), ` +
      `1 active dataset (${seedDatasetTarget.datasetId}), ${coveredStaticUniverseCount}/${staticCount} static universes fully covered.`
  );
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });