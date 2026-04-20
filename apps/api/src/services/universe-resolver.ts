import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { parseUniverseSymbolsJson } from '../lib/universe-symbols.js';

type UniverseRow = {
  id: string;
  definitionKind: string;
  symbolsJson: Prisma.JsonValue;
  definitionParams: Prisma.JsonValue;
};

type UniverseResolutionOptions = {
  minimumRows?: number;
};

function getPrimarySecurityTypesForMarket(market: string): string[] {
  switch (market) {
    case 'HK':
      return ['common_equity'];
    case 'CRYPTO':
      return ['crypto_asset'];
    default:
      throw new Error(`Unsupported dataset market for universe resolution: "${market}".`);
  }
}

export async function resolveUniverseSymbols(
  universe: UniverseRow,
  datasetId: string,
  asOfDate: string,
  options: UniverseResolutionOptions = {}
): Promise<string[]> {
  const dataset = await prisma.dataset.findUnique({
    where: { id: datasetId },
    select: { market: true }
  });

  if (!dataset) {
    throw new Error(`Dataset "${datasetId}" was not found for universe resolution.`);
  }

  switch (universe.definitionKind) {
    case 'static':
      return parseUniverseSymbolsJson(universe.symbolsJson);

    case 'all_common_equity':
      return resolveAllPrimaryMarketAssets(
        dataset.market,
        datasetId,
        asOfDate,
        options.minimumRows
      );

    case 'sector_filter':
      return resolveSectorFilter(
        dataset.market,
        universe.definitionParams,
        datasetId,
        asOfDate,
        options.minimumRows
      );

    case 'liquidity_top_n':
      return resolveLiquidityTopN(
        dataset.market,
        universe.definitionParams,
        datasetId,
        asOfDate,
        options.minimumRows
      );

    default:
      throw new Error(`Unsupported universe definitionKind: "${universe.definitionKind}".`);
  }
}

async function resolveAllPrimaryMarketAssets(
  market: string,
  datasetId: string,
  asOfDate: string,
  minimumRows?: number
): Promise<string[]> {
  return resolveCoveredMarketAssetSymbols({
    market,
    datasetId,
    asOfDate,
    minimumRows
  });
}

async function resolveSectorFilter(
  market: string,
  definitionParams: Prisma.JsonValue,
  datasetId: string,
  asOfDate: string,
  minimumRows?: number
): Promise<string[]> {
  const params = definitionParams as { sectors?: string[] } | null;
  if (!params?.sectors || !Array.isArray(params.sectors) || params.sectors.length === 0) {
    throw new Error('sector_filter universe requires definitionParams.sectors array.');
  }

  return resolveCoveredMarketAssetSymbols({
    market,
    datasetId,
    asOfDate,
    minimumRows,
    sectors: params.sectors
  });
}

async function resolveCoveredMarketAssetSymbols(args: {
  market: string;
  datasetId: string;
  asOfDate: string;
  minimumRows?: number;
  sectors?: string[];
}): Promise<string[]> {
  const grouped = await prisma.eodPrice.groupBy({
    by: ['symbol'],
    where: {
      datasetId: args.datasetId,
      tradeDate: {
        lte: args.asOfDate
      }
    },
    _count: {
      _all: true
    }
  });

  const eligibleSymbols = grouped
    .filter((entry) => entry._count._all >= (args.minimumRows ?? 1))
    .map((entry) => entry.symbol);

  if (eligibleSymbols.length === 0) {
    return [];
  }

  const primarySecurityTypes = getPrimarySecurityTypesForMarket(args.market);

  const entries = await prisma.securityMaster.findMany({
    where: {
      securityType: {
        in: primarySecurityTypes as never[]
      }
    },
    select: { symbol: true },
    orderBy: { symbol: 'asc' }
  });

  const marketAssetSymbolSet = new Set(entries.map((entry) => entry.symbol));
  const eligibleMarketAssetSymbols = eligibleSymbols.filter((symbol) => marketAssetSymbolSet.has(symbol));

  if (eligibleMarketAssetSymbols.length === 0) {
    return [];
  }

  const filteredEntries = await prisma.securityMaster.findMany({
    where: {
      securityType: {
        in: primarySecurityTypes as never[]
      },
      symbol: {
        in: eligibleMarketAssetSymbols
      },
      ...(args.sectors && args.sectors.length > 0
        ? {
            sector: {
              in: args.sectors as never[]
            }
          }
        : {})
    },
    select: { symbol: true },
    orderBy: { symbol: 'asc' }
  });

  return filteredEntries.map((entry) => entry.symbol);
}

async function resolveLiquidityTopN(
  market: string,
  definitionParams: Prisma.JsonValue,
  datasetId: string,
  asOfDate: string,
  minimumRows?: number
): Promise<string[]> {
  const params = definitionParams as { topN?: number; advDays?: number } | null;
  if (!params?.topN || typeof params.topN !== 'number' || params.topN < 1) {
    throw new Error('liquidity_top_n universe requires definitionParams.topN > 0.');
  }

  const advDays = params.advDays ?? 20;

  // Get the last advDays trading dates up to asOfDate
  const recentDatesRows = await prisma.$queryRawUnsafe<{ tradeDate: string }[]>(
    `SELECT DISTINCT "tradeDate" FROM "eod_prices"
     WHERE "datasetId" = $1 AND "tradeDate" <= $2
     ORDER BY "tradeDate" DESC
     LIMIT $3`,
    datasetId,
    asOfDate,
    advDays
  );

  if (recentDatesRows.length === 0) {
    throw new Error(`No trading dates found for dataset "${datasetId}" up to ${asOfDate}.`);
  }

  const minDate = recentDatesRows[recentDatesRows.length - 1]!.tradeDate;
  const eligibleSymbols = new Set(
    await resolveCoveredMarketAssetSymbols({
      market,
      datasetId,
      asOfDate,
      minimumRows
    })
  );

  if (eligibleSymbols.size === 0) {
    return [];
  }

  // Compute average daily volume per eligible symbol over those dates.
  const volumeRows = await prisma.eodPrice.groupBy({
    by: ['symbol'],
    where: {
      datasetId,
      tradeDate: {
        gte: minDate,
        lte: asOfDate
      },
      volume: {
        not: null
      },
      symbol: {
        in: Array.from(eligibleSymbols)
      }
    },
    _avg: {
      volume: true
    },
    orderBy: {
      _avg: {
        volume: 'desc'
      }
    },
    take: params.topN
  });

  return volumeRows
    .filter((row) => row._avg.volume != null)
    .map((row) => row.symbol)
    .sort();
}
