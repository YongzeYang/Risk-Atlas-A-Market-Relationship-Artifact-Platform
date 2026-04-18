export type PriceRow = {
  symbol: string;
  tradeDate: string;
  adjClose: number;
};

export function buildRowsBySymbol(
  rows: PriceRow[],
  symbolOrder: string[]
): Map<string, Map<string, number>> {
  const rowsBySymbol = new Map<string, Map<string, number>>();

  for (const symbol of symbolOrder) {
    rowsBySymbol.set(symbol, new Map<string, number>());
  }

  for (const row of rows) {
    const priceMap = rowsBySymbol.get(row.symbol);
    if (!priceMap) {
      continue;
    }

    priceMap.set(row.tradeDate, row.adjClose);
  }

  return rowsBySymbol;
}

export function selectAlignedWindowDates(
  rowsBySymbol: Map<string, Map<string, number>>,
  symbolOrder: string[],
  asOfDate: string,
  windowDays: number
): string[] {
  const expectedPriceCount = windowDays + 1;

  const allDateLists = symbolOrder.map((symbol) => {
    const priceMap = rowsBySymbol.get(symbol);

    if (!priceMap) {
      throw new Error(`Price map missing for symbol "${symbol}".`);
    }

    const dates = [...priceMap.keys()].filter((tradeDate) => tradeDate <= asOfDate).sort();

    if (dates.length < expectedPriceCount) {
      throw new Error(
        `Symbol "${symbol}" has only ${dates.length} price rows up to ${asOfDate}, ` +
          `but ${expectedPriceCount} are required for windowDays=${windowDays}.`
      );
    }

    return dates;
  });

  const commonDates = [...allDateLists[0]!];
  const otherDateSets = allDateLists.slice(1).map((dates) => new Set(dates));

  const alignedCommonDates = commonDates.filter((tradeDate) =>
    otherDateSets.every((dateSet) => dateSet.has(tradeDate))
  );

  if (alignedCommonDates.length < expectedPriceCount) {
    throw new Error(
      `Only ${alignedCommonDates.length} aligned trading dates are available across the selected universe, ` +
        `but ${expectedPriceCount} are required.`
    );
  }

  const selectedDates = alignedCommonDates.slice(-expectedPriceCount);

  if (selectedDates[selectedDates.length - 1] !== asOfDate) {
    throw new Error(
      `Selected asOfDate "${asOfDate}" is not present as the final aligned trading date across all symbols.`
    );
  }

  return selectedDates;
}

export function buildAlignedPriceSeries(
  rowsBySymbol: Map<string, Map<string, number>>,
  symbolOrder: string[],
  selectedDates: string[]
): Map<string, number[]> {
  const priceSeriesBySymbol = new Map<string, number[]>();

  for (const symbol of symbolOrder) {
    const priceMap = rowsBySymbol.get(symbol);
    if (!priceMap) {
      throw new Error(`Missing price series for symbol "${symbol}".`);
    }

    const alignedPrices = selectedDates.map((tradeDate) => {
      const price = priceMap.get(tradeDate);

      if (price === undefined) {
        throw new Error(`Missing aligned price for symbol "${symbol}" on ${tradeDate}.`);
      }

      if (!Number.isFinite(price) || price <= 0) {
        throw new Error(`Invalid adjusted close for symbol "${symbol}" on ${tradeDate}.`);
      }

      return price;
    });

    priceSeriesBySymbol.set(symbol, alignedPrices);
  }

  return priceSeriesBySymbol;
}

export function computeLogReturns(prices: number[]): number[] {
  if (prices.length < 2) {
    throw new Error('At least two prices are required to compute log returns.');
  }

  const returns: number[] = [];

  for (let i = 1; i < prices.length; i += 1) {
    const previous = prices[i - 1]!;
    const current = prices[i]!;

    if (previous <= 0 || current <= 0) {
      throw new Error('Adjusted close prices must be strictly positive.');
    }

    returns.push(Math.log(current / previous));
  }

  return returns;
}

export function buildCorrelationMatrix(
  symbolOrder: string[],
  returnSeriesBySymbol: Map<string, number[]>
): number[][] {
  const n = symbolOrder.length;
  const scores = Array.from({ length: n }, () => Array<number>(n).fill(0));

  for (let i = 0; i < n; i += 1) {
    scores[i]![i] = 1;
  }

  for (let i = 0; i < n; i += 1) {
    const leftSymbol = symbolOrder[i]!;
    const leftReturns = returnSeriesBySymbol.get(leftSymbol);

    if (!leftReturns) {
      throw new Error(`Missing return series for symbol "${leftSymbol}".`);
    }

    for (let j = i + 1; j < n; j += 1) {
      const rightSymbol = symbolOrder[j]!;
      const rightReturns = returnSeriesBySymbol.get(rightSymbol);

      if (!rightReturns) {
        throw new Error(`Missing return series for symbol "${rightSymbol}".`);
      }

      const score = pearsonCorrelation(leftReturns, rightReturns);
      scores[i]![j] = score;
      scores[j]![i] = score;
    }
  }

  return scores;
}

export function pearsonCorrelation(left: number[], right: number[]): number {
  if (left.length !== right.length) {
    throw new Error('Return series length mismatch while computing Pearson correlation.');
  }

  if (left.length === 0) {
    throw new Error('Cannot compute Pearson correlation for an empty return series.');
  }

  const meanLeft = mean(left);
  const meanRight = mean(right);

  let covariance = 0;
  let varianceLeft = 0;
  let varianceRight = 0;

  for (let i = 0; i < left.length; i += 1) {
    const centeredLeft = left[i]! - meanLeft;
    const centeredRight = right[i]! - meanRight;

    covariance += centeredLeft * centeredRight;
    varianceLeft += centeredLeft * centeredLeft;
    varianceRight += centeredRight * centeredRight;
  }

  if (varianceLeft <= 1e-20 || varianceRight <= 1e-20) {
    throw new Error('Encountered a near-zero-variance return series.');
  }

  const raw = covariance / Math.sqrt(varianceLeft * varianceRight);
  return clamp(raw, -1, 1);
}

export function computeCumulativeReturn(prices: number[]): number {
  if (prices.length < 2) {
    throw new Error('At least two prices are required to compute a cumulative return.');
  }

  const first = prices[0]!;
  const last = prices[prices.length - 1]!;

  if (first <= 0 || last <= 0) {
    throw new Error('Adjusted close prices must be strictly positive.');
  }

  return last / first - 1;
}

export function computeSpreadZScore(leftPrices: number[], rightPrices: number[]): number | null {
  if (leftPrices.length !== rightPrices.length) {
    throw new Error('Price series length mismatch while computing spread z-score.');
  }

  if (leftPrices.length < 2) {
    throw new Error('At least two prices are required to compute a spread z-score.');
  }

  const spreads = leftPrices.map((leftPrice, index) => {
    const rightPrice = rightPrices[index]!;

    if (leftPrice <= 0 || rightPrice <= 0) {
      throw new Error('Adjusted close prices must be strictly positive.');
    }

    return Math.log(leftPrice) - Math.log(rightPrice);
  });

  const spreadMean = mean(spreads);
  const spreadVariance = spreads.reduce((acc, value) => {
    const centered = value - spreadMean;
    return acc + centered * centered;
  }, 0);

  if (spreadVariance <= 1e-20) {
    return null;
  }

  const spreadStd = Math.sqrt(spreadVariance / spreads.length);
  if (spreadStd <= 1e-20) {
    return null;
  }

  return (spreads[spreads.length - 1]! - spreadMean) / spreadStd;
}

function mean(values: number[]): number {
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}