// apps/api/prisma/seed.ts
import 'dotenv/config';

import { scryptSync } from 'node:crypto';
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

async function upsertDataset() {
  await prisma.dataset.upsert({
    where: {
      id: DEMO_DATASET_ID
    },
    update: {
      name: DEMO_DATASET_NAME,
      source: DatasetSource.curated_csv,
      market: Market.HK
    },
    create: {
      id: DEMO_DATASET_ID,
      name: DEMO_DATASET_NAME,
      source: DatasetSource.curated_csv,
      market: Market.HK
    }
  });
}

async function validateDatasetCoverage(datasetId: string) {
  const universes = await prisma.universe.findMany({
    where: { definitionKind: 'static' },
    orderBy: {
      id: 'asc'
    }
  });

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
    const insufficient = symbols.filter(
      (symbol) => (countsBySymbol.get(symbol) ?? 0) < MIN_REQUIRED_PRICE_ROWS
    );

    if (missing.length > 0 || insufficient.length > 0) {
      throw new Error(
        [
          `Dataset coverage validation failed for universe "${universe.id}".`,
          missing.length > 0 ? `Missing symbols: ${missing.join(', ')}` : null,
          insufficient.length > 0
            ? `Insufficient price rows (< ${MIN_REQUIRED_PRICE_ROWS}): ${insufficient
                .map((symbol) => `${symbol}(${countsBySymbol.get(symbol) ?? 0})`)
                .join(', ')}`
            : null
        ]
          .filter(Boolean)
          .join(' ')
      );
    }
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
  await seedSecurityMaster();
  console.log(`Seeded ${SECURITY_MASTER.length} security master entries.`);

  for (const universe of SEED_UNIVERSES) {
    await upsertUniverse(universe);
  }

  await upsertDataset();

  const generationSummary = await writeDeterministicHkEodDemoCsv(DEFAULT_DEMO_CSV_PATH);
  console.log(
    `Generated ${generationSummary.outputPath} with ${generationSummary.rowCount} rows ` +
      `(${generationSummary.symbolCount} symbols, ${generationSummary.minTradeDate}..${generationSummary.maxTradeDate}).`
  );

  const importSummary = await importEodCsv({
    datasetId: DEMO_DATASET_ID,
    datasetName: DEMO_DATASET_NAME,
    csvPath: DEFAULT_DEMO_CSV_PATH,
    replaceExisting: true,
    prismaClient: prisma
  });

  console.log(
    `Imported dataset ${importSummary.datasetId}: ${importSummary.rowCount} rows, ` +
      `${importSummary.symbolCount} symbols, ${importSummary.minTradeDate}..${importSummary.maxTradeDate}.`
  );

  await validateDatasetCoverage(DEMO_DATASET_ID);

  await seedInviteCode();
  console.log(`Seeded ${SEED_INVITE_CODES.length} invite codes.`);

  const staticCount = SEED_UNIVERSES.filter((u) => u.definitionKind === 'static').length;
  const dynamicCount = SEED_UNIVERSES.length - staticCount;
  console.log(
    `Seed complete: ${SEED_UNIVERSES.length} universes (${staticCount} static, ${dynamicCount} dynamic), ` +
      `1 dataset, coverage validated for static universes.`
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