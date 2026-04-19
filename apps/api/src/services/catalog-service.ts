// apps/api/src/services/catalog-service.ts
import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

const CATALOG_CACHE_TTL_MS = Number.parseInt(process.env.CATALOG_CACHE_TTL_MS ?? '30000', 10);

export const CATALOG_CACHE_CONTROL = `public, max-age=${Math.max(
  0,
  Math.floor(CATALOG_CACHE_TTL_MS / 1000)
)}`;

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
  firstValidAsOfByWindowDays: Record<string, string | null>;
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

type CacheEntry<T> = {
  value: T | null;
  expiresAt: number;
  promise: Promise<T> | null;
};

const datasetListCache: CacheEntry<DatasetListItem[]> = {
  value: null,
  expiresAt: 0,
  promise: null
};

const universeListCache: CacheEntry<UniverseListItem[]> = {
  value: null,
  expiresAt: 0,
  promise: null
};

const securityMasterCache: CacheEntry<SecurityMasterItem[]> = {
  value: null,
  expiresAt: 0,
  promise: null
};

async function withCatalogCache<T>(cache: CacheEntry<T>, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();

  if (cache.value !== null && cache.expiresAt > now) {
    return cache.value;
  }

  if (cache.promise) {
    return cache.promise;
  }

  cache.promise = loader()
    .then((value) => {
      cache.value = value;
      cache.expiresAt = Date.now() + CATALOG_CACHE_TTL_MS;
      return value;
    })
    .finally(() => {
      cache.promise = null;
    });

  return cache.promise;
}

function toInt(value: bigint | number | null | undefined): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }

  return value ?? 0;
}

export async function listDatasets(): Promise<DatasetListItem[]> {
  return withCatalogCache(datasetListCache, async () => {
    const datasets = await prisma.dataset.findMany({
      select: {
        id: true,
        name: true,
        source: true,
        market: true,
        createdAt: true,
        catalogSymbolCount: true,
        catalogPriceRowCount: true,
        catalogMinTradeDate: true,
        catalogMaxTradeDate: true,
        catalogFirstValidAsOf60: true,
        catalogFirstValidAsOf120: true,
        catalogFirstValidAsOf252: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    return datasets.map((dataset) => {
      const firstValidAsOfByWindowDays = {
        '60': dataset.catalogFirstValidAsOf60,
        '120': dataset.catalogFirstValidAsOf120,
        '252': dataset.catalogFirstValidAsOf252
      };

      return {
        id: dataset.id,
        name: dataset.name,
        source: dataset.source,
        market: dataset.market,
        createdAt: dataset.createdAt.toISOString(),
        symbolCount: dataset.catalogSymbolCount,
        priceRowCount: toInt(dataset.catalogPriceRowCount),
        minTradeDate: dataset.catalogMinTradeDate,
        maxTradeDate: dataset.catalogMaxTradeDate,
        firstValidAsOfByWindowDays
      };
    });
  });
}

export async function listUniverses(): Promise<UniverseListItem[]> {
  return withCatalogCache(universeListCache, async () => {
    const [universes, datasets] = await Promise.all([
      prisma.universe.findMany({
        orderBy: [{ symbolCount: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }]
      }),
      prisma.dataset.findMany({
        select: {
          id: true,
          market: true
        }
      })
    ]);

    const datasetIdsByMarket = new Map<string, string[]>();

    for (const dataset of datasets) {
      const existing = datasetIdsByMarket.get(dataset.market) ?? [];
      existing.push(dataset.id);
      datasetIdsByMarket.set(dataset.market, existing);
    }

    return universes.map((universe) => ({
      id: universe.id,
      name: universe.name,
      market: universe.market,
      symbolCount: universe.symbolCount,
      symbols: asStringArray(universe.symbolsJson),
      definitionKind: universe.definitionKind,
      definitionParams: universe.definitionParams,
      supportedDatasetIds: datasetIdsByMarket.get(universe.market) ?? [],
      createdAt: universe.createdAt.toISOString()
    }));
  });
}

export async function listSecurityMaster(): Promise<SecurityMasterItem[]> {
  return withCatalogCache(securityMasterCache, async () => {
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
  });
}