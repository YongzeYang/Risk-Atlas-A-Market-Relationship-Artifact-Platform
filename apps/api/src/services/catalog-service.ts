// apps/api/src/services/catalog-service.ts
import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

function asStringArray(value: Prisma.JsonValue): string[] {
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
  symbolCount: number;
  symbols: string[];
  createdAt: string;
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
    orderBy: [{ symbolCount: 'desc' }, { id: 'asc' }]
  });

  return universes.map((universe) => ({
    id: universe.id,
    name: universe.name,
    market: universe.market,
    symbolCount: universe.symbolCount,
    symbols: asStringArray(universe.symbolsJson),
    createdAt: universe.createdAt.toISOString()
  }));
}