// apps/api/src/services/catalog-service.ts
import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { BUILD_RUN_WINDOW_DAYS } from '../contracts/build-runs.js';

function asStringArray(value: Prisma.JsonValue): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error('Expected JSON string array.');
  }

  return value as string[];
}

export type DatasetListItem = {
  id: string;
  name: string;
  source: string;
  market: string;
  createdAt: string;
  symbolCount: number;
  priceRowCount: number;
  minTradeDate: string | null;
  maxTradeDate: string | null;
};

export type UniverseListItem = {
  id: string;
  name: string;
  market: string;
  symbolCount: number | null;
  symbols: string[];
  definitionKind: string;
  definitionParams: Prisma.JsonValue;
  supportedDatasetIds: string[] | null;
  createdAt: string;
};

export type SecurityMasterItem = {
  symbol: string;
  name: string;
  shortName: string | null;
  securityType: string;
  sector: string | null;
  market: string;
};

export async function listDatasets(): Promise<DatasetListItem[]> {
  const datasets = await prisma.dataset.findMany({
    orderBy: {
      createdAt: 'asc'
    }
  });

  return Promise.all(
    datasets.map(async (dataset) => {
      const [priceRowCount, distinctSymbols, minTradeDateRow, maxTradeDateRow] = await Promise.all([
        prisma.eodPrice.count({
          where: {
            datasetId: dataset.id
          }
        }),
        prisma.eodPrice.findMany({
          where: {
            datasetId: dataset.id
          },
          distinct: ['symbol'],
          select: {
            symbol: true
          }
        }),
        prisma.eodPrice.findFirst({
          where: {
            datasetId: dataset.id
          },
          orderBy: {
            tradeDate: 'asc'
          },
          select: {
            tradeDate: true
          }
        }),
        prisma.eodPrice.findFirst({
          where: {
            datasetId: dataset.id
          },
          orderBy: {
            tradeDate: 'desc'
          },
          select: {
            tradeDate: true
          }
        })
      ]);

      return {
        id: dataset.id,
        name: dataset.name,
        source: dataset.source,
        market: dataset.market,
        createdAt: dataset.createdAt.toISOString(),
        symbolCount: distinctSymbols.length,
        priceRowCount,
        minTradeDate: minTradeDateRow?.tradeDate ?? null,
        maxTradeDate: maxTradeDateRow?.tradeDate ?? null
      };
    })
  );
}

export async function listUniverses(): Promise<UniverseListItem[]> {
  const universes = await prisma.universe.findMany({
    orderBy: [{ symbolCount: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }]
  });

  const datasets = await prisma.dataset.findMany({
    select: {
      id: true,
      market: true
    }
  });

  const minRequiredRows = Math.max(...BUILD_RUN_WINDOW_DAYS) + 1;

  return Promise.all(
    universes.map(async (universe) => {
      const symbols = asStringArray(universe.symbolsJson);
      let supportedDatasetIds: string[] | null = null;

      if (universe.definitionKind === 'static' && symbols.length > 0) {
        supportedDatasetIds = [];

        for (const dataset of datasets) {
          if (dataset.market !== universe.market) {
            continue;
          }

          const coverage = await prisma.eodPrice.groupBy({
            by: ['symbol'],
            where: {
              datasetId: dataset.id,
              symbol: {
                in: symbols
              }
            },
            _count: {
              _all: true
            }
          });

          const countsBySymbol = new Map(
            coverage.map((entry) => [entry.symbol, entry._count._all] as const)
          );

          const fullyCovered = symbols.every(
            (symbol) => (countsBySymbol.get(symbol) ?? 0) >= minRequiredRows
          );

          if (fullyCovered) {
            supportedDatasetIds.push(dataset.id);
          }
        }
      }

      return {
        id: universe.id,
        name: universe.name,
        market: universe.market,
        symbolCount: universe.symbolCount,
        symbols,
        definitionKind: universe.definitionKind,
        definitionParams: universe.definitionParams,
        supportedDatasetIds,
        createdAt: universe.createdAt.toISOString()
      };
    })
  );
}

export async function listSecurityMaster(): Promise<SecurityMasterItem[]> {
  const entries = await prisma.securityMaster.findMany({
    orderBy: { symbol: 'asc' }
  });

  return entries.map((entry) => ({
    symbol: entry.symbol,
    name: entry.name,
    shortName: entry.shortName,
    securityType: entry.securityType,
    sector: entry.sector,
    market: entry.market
  }));
}