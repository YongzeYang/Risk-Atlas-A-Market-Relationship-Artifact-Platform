import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { parseUniverseSymbolsJson } from '../lib/universe-symbols.js';

type UniverseRow = {
  id: string;
  definitionKind: string;
  symbolsJson: Prisma.JsonValue;
  definitionParams: Prisma.JsonValue;
};

export async function resolveUniverseSymbols(
  universe: UniverseRow,
  datasetId: string,
  asOfDate: string
): Promise<string[]> {
  switch (universe.definitionKind) {
    case 'static':
      return parseUniverseSymbolsJson(universe.symbolsJson);

    case 'all_common_equity':
      return resolveAllCommonEquity();

    case 'sector_filter':
      return resolveSectorFilter(universe.definitionParams);

    case 'liquidity_top_n':
      return resolveLiquidityTopN(universe.definitionParams, datasetId, asOfDate);

    default:
      throw new Error(`Unsupported universe definitionKind: "${universe.definitionKind}".`);
  }
}

async function resolveAllCommonEquity(): Promise<string[]> {
  const entries = await prisma.securityMaster.findMany({
    where: { securityType: 'common_equity' },
    select: { symbol: true },
    orderBy: { symbol: 'asc' }
  });

  return entries.map((e) => e.symbol);
}

async function resolveSectorFilter(definitionParams: Prisma.JsonValue): Promise<string[]> {
  const params = definitionParams as { sectors?: string[] } | null;
  if (!params?.sectors || !Array.isArray(params.sectors) || params.sectors.length === 0) {
    throw new Error('sector_filter universe requires definitionParams.sectors array.');
  }

  const entries = await prisma.securityMaster.findMany({
    where: {
      securityType: 'common_equity',
      sector: { in: params.sectors as never[] }
    },
    select: { symbol: true },
    orderBy: { symbol: 'asc' }
  });

  return entries.map((e) => e.symbol);
}

async function resolveLiquidityTopN(
  definitionParams: Prisma.JsonValue,
  datasetId: string,
  asOfDate: string
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

  // Compute average daily volume per symbol over those dates
  const volumeRows = await prisma.$queryRawUnsafe<{ symbol: string; avgVolume: number }[]>(
    `SELECT "symbol", AVG(CAST("volume" AS DOUBLE PRECISION)) as "avgVolume"
     FROM "eod_prices"
     WHERE "datasetId" = $1 AND "tradeDate" >= $2 AND "tradeDate" <= $3 AND "volume" IS NOT NULL
     GROUP BY "symbol"
     ORDER BY "avgVolume" DESC
     LIMIT $4`,
    datasetId,
    minDate,
    asOfDate,
    params.topN
  );

  // Filter to common equities only
  const commonEquitySymbols = new Set(
    (
      await prisma.securityMaster.findMany({
        where: { securityType: 'common_equity' },
        select: { symbol: true }
      })
    ).map((e) => e.symbol)
  );

  return volumeRows
    .filter((r) => commonEquitySymbols.has(r.symbol))
    .map((r) => r.symbol)
    .slice(0, params.topN)
    .sort();
}
