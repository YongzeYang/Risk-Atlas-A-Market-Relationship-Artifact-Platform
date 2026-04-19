import { prisma } from '../lib/prisma.js';
import {
  hasSufficientVariance,
  type PriceRow
} from './correlation-analytics.js';

export type PreparedCorrelationInputs = {
  marketTradeDates: string[];
  matrixReadySymbolOrder: string[];
  returnVectorsBySymbol: Map<string, Float64Array>;
  filteredOutSymbols: string[];
};

const MARKET_DATE_LOOKBACK_MULTIPLIER = 2;

export async function prepareCorrelationInputs(args: {
  datasetId: string;
  symbolOrder: string[];
  asOfDate: string;
  windowDays: number;
}): Promise<PreparedCorrelationInputs> {
  if (args.symbolOrder.length === 0) {
    return {
      marketTradeDates: [],
      matrixReadySymbolOrder: [],
      returnVectorsBySymbol: new Map<string, Float64Array>(),
      filteredOutSymbols: []
    };
  }

  const priceRows = await prisma.eodPrice.findMany({
    where: {
      datasetId: args.datasetId,
      symbol: {
        in: args.symbolOrder
      },
      tradeDate: {
        lte: args.asOfDate
      }
    },
    orderBy: [
      {
        symbol: 'asc'
      },
      {
        tradeDate: 'asc'
      }
    ],
    select: {
      symbol: true,
      tradeDate: true,
      adjClose: true
    }
  });

  const marketTradeDates = selectPairwiseMarketTradeDates(priceRows, args.windowDays);
  const marketDateIndexByDate = new Map(
    marketTradeDates.map((tradeDate, index) => [tradeDate, index] as const)
  );
  const priceRowsBySymbol = groupPriceRowsBySymbol(priceRows, args.symbolOrder);

  const returnVectorsBySymbol = new Map<string, Float64Array>();
  const matrixReadySymbolOrder: string[] = [];
  const filteredOutSymbols: string[] = [];

  for (const symbol of args.symbolOrder) {
    const rows = priceRowsBySymbol.get(symbol) ?? [];
    const { trailingReturns, returnVector } = buildReturnVector(rows, marketDateIndexByDate);
    const recentReturns = trailingReturns.slice(-args.windowDays);

    if (recentReturns.length < args.windowDays || !hasSufficientVariance(recentReturns)) {
      filteredOutSymbols.push(symbol);
      continue;
    }

    matrixReadySymbolOrder.push(symbol);
    returnVectorsBySymbol.set(symbol, returnVector);
  }

  return {
    marketTradeDates,
    matrixReadySymbolOrder,
    returnVectorsBySymbol,
    filteredOutSymbols
  };
}

function selectPairwiseMarketTradeDates(priceRows: PriceRow[], windowDays: number): string[] {
  const uniqueTradeDates = [...new Set(priceRows.map((row) => row.tradeDate))].sort();
  const lookbackCount = Math.min(
    uniqueTradeDates.length,
    Math.max(windowDays + 1, windowDays * MARKET_DATE_LOOKBACK_MULTIPLIER + 1)
  );

  return uniqueTradeDates.slice(-lookbackCount);
}

function groupPriceRowsBySymbol(
  priceRows: PriceRow[],
  symbolOrder: string[]
): Map<string, PriceRow[]> {
  const grouped = new Map(symbolOrder.map((symbol) => [symbol, [] as PriceRow[]]));

  for (const row of priceRows) {
    grouped.get(row.symbol)?.push(row);
  }

  return grouped;
}

function buildReturnVector(
  priceRows: PriceRow[],
  marketDateIndexByDate: Map<string, number>
): { trailingReturns: number[]; returnVector: Float64Array } {
  const returnVector = new Float64Array(marketDateIndexByDate.size);
  returnVector.fill(Number.NaN);

  const trailingReturns: number[] = [];

  for (let index = 1; index < priceRows.length; index += 1) {
    const previous = priceRows[index - 1]?.adjClose;
    const currentRow = priceRows[index]!;
    const current = currentRow.adjClose;

    if (previous === undefined || !Number.isFinite(previous) || !Number.isFinite(current)) {
      throw new Error(
        `Encountered non-finite adjusted close while preparing return vector for "${currentRow.symbol}".`
      );
    }

    if (previous <= 0 || current <= 0) {
      throw new Error(`Adjusted close prices must be strictly positive for symbol "${currentRow.symbol}".`);
    }

    const logReturn = Math.log(current / previous);
    trailingReturns.push(logReturn);

    const marketIndex = marketDateIndexByDate.get(currentRow.tradeDate);
    if (marketIndex !== undefined) {
      returnVector[marketIndex] = logReturn;
    }
  }

  return {
    trailingReturns,
    returnVector
  };
}