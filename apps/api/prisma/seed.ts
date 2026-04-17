// apps/api/prisma/seed.ts
import 'dotenv/config';

import { DatasetSource, Market, Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

import {
  DEMO_DATASET_ID,
  DEMO_DATASET_NAME,
  HK_SYMBOL_PATTERN,
  MIN_REQUIRED_PRICE_ROWS,
  SEED_UNIVERSES
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

async function upsertUniverse(universe: { id: string; name: string; symbols: string[] }) {
  const symbols = normalizeAndValidateSymbols(universe.symbols);

  await prisma.universe.upsert({
    where: { id: universe.id },
    update: {
      name: universe.name,
      market: Market.HK,
      symbolsJson: symbols as Prisma.InputJsonValue,
      symbolCount: symbols.length
    },
    create: {
      id: universe.id,
      name: universe.name,
      market: Market.HK,
      symbolsJson: symbols as Prisma.InputJsonValue,
      symbolCount: symbols.length
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

async function main() {
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

  console.log(
    `Seed complete: ${SEED_UNIVERSES.length} universes, 1 dataset, coverage validated for all V1 universes.`
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