import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { ServiceError } from '../lib/service-error.js';
import {
  MAX_BUILD_UNIVERSE_SIZE,
  MIN_BUILD_UNIVERSE_SIZE,
  type BuildRunWindowDays
} from '../contracts/build-runs.js';
import { resolveUniverseSymbols } from './universe-resolver.js';

type UniverseValidationRow = {
  id: string;
  definitionKind: string;
  symbolsJson: Prisma.JsonValue;
  definitionParams: Prisma.JsonValue;
};

export async function validateBuildRequestCoverage(args: {
  datasetId: string;
  universe: UniverseValidationRow;
  asOfDate: string;
  windowDays: BuildRunWindowDays;
}): Promise<string[]> {
  const resolvedSymbols = await resolveUniverseSymbols(
    args.universe,
    args.datasetId,
    args.asOfDate
  );

  if (
    resolvedSymbols.length < MIN_BUILD_UNIVERSE_SIZE ||
    resolvedSymbols.length > MAX_BUILD_UNIVERSE_SIZE
  ) {
    throw new ServiceError(
      400,
      `Universe symbol count must be between ${MIN_BUILD_UNIVERSE_SIZE} and ${MAX_BUILD_UNIVERSE_SIZE}.`
    );
  }

  const grouped = await prisma.eodPrice.groupBy({
    by: ['symbol'],
    where: {
      datasetId: args.datasetId,
      symbol: {
        in: resolvedSymbols
      },
      tradeDate: {
        lte: args.asOfDate
      }
    },
    _count: {
      _all: true
    }
  });

  const countsBySymbol = new Map(grouped.map((entry) => [entry.symbol, entry._count._all] as const));
  const requiredRows = args.windowDays + 1;

  const insufficient = resolvedSymbols.filter(
    (symbol) => (countsBySymbol.get(symbol) ?? 0) < requiredRows
  );

  if (insufficient.length > 0) {
    const preview = insufficient
      .slice(0, 5)
      .map((symbol) => `${symbol}(${countsBySymbol.get(symbol) ?? 0})`)
      .join(', ');

    throw new ServiceError(
      400,
      `Dataset "${args.datasetId}" does not have enough history for universe "${args.universe.id}" at ${args.asOfDate}. ` +
        `Need ${requiredRows} rows per symbol. First insufficient symbols: ${preview}.`
    );
  }

  return resolvedSymbols;
}