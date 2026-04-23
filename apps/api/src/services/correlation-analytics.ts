import type { BuildRunScoreMethod } from '../contracts/build-runs.js';

export type PriceRow = {
  symbol: string;
  tradeDate: string;
  adjClose: number;
};

const NEAR_ZERO_VARIANCE_THRESHOLD = 1e-20;
const EWMA_LAMBDA = 0.94;
const TAIL_PROBABILITY = 0.05;
const DEFAULT_MUTUAL_INFORMATION_BIN_COUNT = 10;
const MUTUAL_INFORMATION_ENTROPY_EPSILON = 1e-12;

type HistogramBinning = {
  edges: readonly number[];
  binCount: number;
};

type ScoreMethodPreparation = {
  tailThreshold?: number;
  mutualInformationBinning?: HistogramBinning;
};

type PairwiseScoreBuildArgs = {
  symbolOrder: string[];
  returnVectorsBySymbol: Map<string, Float64Array>;
  windowDays: number;
  scoreMethod: BuildRunScoreMethod;
  minimumPairOverlapCount?: number;
};

export type PairwiseScoreRowBuilder = {
  buildLowerRow(rowIndex: number): number[];
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

export function buildCorrelationMatrix(args: {
  symbolOrder: string[];
  returnVectorsBySymbol: Map<string, Float64Array>;
  windowDays: number;
  minimumPairOverlapCount?: number;
}): number[][] {
  return buildScoreMatrix({
    ...args,
    scoreMethod: 'pearson_corr'
  });
}

export function buildScoreMatrix(args: PairwiseScoreBuildArgs): number[][] {
  const n = args.symbolOrder.length;
  const scores = Array.from({ length: n }, () => Array<number>(n).fill(0));
  const rowBuilder = createPairwiseScoreRowBuilder(args);

  for (let i = 0; i < n; i += 1) {
    const lowerRow = rowBuilder.buildLowerRow(i);
    for (let j = 0; j <= i; j += 1) {
      const score = lowerRow[j]!;
      scores[i]![j] = score;
      scores[j]![i] = score;
    }
  }

  return scores;
}

export function createPairwiseScoreRowBuilder(args: PairwiseScoreBuildArgs): PairwiseScoreRowBuilder {
  const minimumPairOverlapCount =
    args.minimumPairOverlapCount ?? getMinimumPairwiseOverlapCount(args.windowDays);
  const preparations = prepareScoreMethodInputs(
    args.scoreMethod,
    args.symbolOrder,
    args.returnVectorsBySymbol,
    args.windowDays
  );

  return {
    buildLowerRow(rowIndex) {
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= args.symbolOrder.length) {
        throw new Error(`Row index ${rowIndex} is out of bounds for score generation.`);
      }

      const leftSymbol = args.symbolOrder[rowIndex]!;
      const leftReturns = args.returnVectorsBySymbol.get(leftSymbol);
      if (!leftReturns) {
        throw new Error(`Missing return vector for symbol "${leftSymbol}".`);
      }

      const lowerRow = Array<number>(rowIndex + 1).fill(0);
      lowerRow[rowIndex] = 1;

      for (let columnIndex = 0; columnIndex < rowIndex; columnIndex += 1) {
        const rightSymbol = args.symbolOrder[columnIndex]!;
        const rightReturns = args.returnVectorsBySymbol.get(rightSymbol);

        if (!rightReturns) {
          throw new Error(`Missing return vector for symbol "${rightSymbol}".`);
        }

        lowerRow[columnIndex] = computePairScoreForMethod({
          scoreMethod: args.scoreMethod,
          leftReturns,
          rightReturns,
          windowDays: args.windowDays,
          minimumPairOverlapCount,
          leftPreparation: preparations.get(leftSymbol),
          rightPreparation: preparations.get(rightSymbol)
        });
      }

      return lowerRow;
    }
  };
}

export function getMinimumPairwiseOverlapCount(windowDays: number): number {
  if (windowDays >= 252) {
    return 60;
  }

  if (windowDays >= 120) {
    return 40;
  }

  return 20;
}

export function computeTrailingOverlapPearsonCorrelation(
  left: Float64Array,
  right: Float64Array,
  windowDays: number,
  minimumPairOverlapCount: number
): number {
  if (left.length !== right.length) {
    throw new Error('Return vector length mismatch while computing pairwise Pearson correlation.');
  }

  let observationCount = 0;
  let meanLeft = 0;
  let meanRight = 0;
  let covariance = 0;
  let varianceLeft = 0;
  let varianceRight = 0;

  for (let index = left.length - 1; index >= 0 && observationCount < windowDays; index -= 1) {
    const leftValue = left[index]!;
    const rightValue = right[index]!;

    if (Number.isNaN(leftValue) || Number.isNaN(rightValue)) {
      continue;
    }

    observationCount += 1;

    const leftDelta = leftValue - meanLeft;
    meanLeft += leftDelta / observationCount;

    const rightDelta = rightValue - meanRight;
    meanRight += rightDelta / observationCount;

    covariance += leftDelta * (rightValue - meanRight);
    varianceLeft += leftDelta * (leftValue - meanLeft);
    varianceRight += rightDelta * (rightValue - meanRight);
  }

  if (observationCount < minimumPairOverlapCount) {
    return 0;
  }

  if (varianceLeft <= NEAR_ZERO_VARIANCE_THRESHOLD || varianceRight <= NEAR_ZERO_VARIANCE_THRESHOLD) {
    return 0;
  }

  const raw = covariance / Math.sqrt(varianceLeft * varianceRight);
  return clamp(raw, -1, 1);
}

export function computeTrailingOverlapEwmaCorrelation(
  left: Float64Array,
  right: Float64Array,
  windowDays: number,
  minimumPairOverlapCount: number,
  lambda = EWMA_LAMBDA
): number {
  const observations = extractTrailingOverlapObservations(left, right, windowDays);

  if (observations.leftValues.length < minimumPairOverlapCount) {
    return 0;
  }

  return computeEwmaCorrelationForSeries(observations.leftValues, observations.rightValues, lambda);
}

export function computeTrailingOverlapTailDependence(
  left: Float64Array,
  right: Float64Array,
  windowDays: number,
  minimumPairOverlapCount: number,
  leftThreshold: number,
  rightThreshold: number,
  tailProbability = TAIL_PROBABILITY
): number {
  const observations = extractTrailingOverlapObservations(left, right, windowDays);

  if (observations.leftValues.length < minimumPairOverlapCount) {
    return 0;
  }

  return computeEmpiricalTailDependenceForSeries(
    observations.leftValues,
    observations.rightValues,
    leftThreshold,
    rightThreshold,
    tailProbability
  );
}

export function computeTrailingOverlapNormalizedMutualInformation(
  left: Float64Array,
  right: Float64Array,
  windowDays: number,
  minimumPairOverlapCount: number,
  leftBinning: HistogramBinning,
  rightBinning: HistogramBinning
): number {
  const observations = extractTrailingOverlapObservations(left, right, windowDays);

  if (observations.leftValues.length < minimumPairOverlapCount) {
    return 0;
  }

  return computeNormalizedMutualInformationForSeries(
    observations.leftValues,
    observations.rightValues,
    leftBinning,
    rightBinning
  );
}

export function computeAlignedScoreForMethod(
  scoreMethod: BuildRunScoreMethod,
  left: number[],
  right: number[]
): number {
  switch (scoreMethod) {
    case 'pearson_corr':
      return pearsonCorrelation(left, right);
    case 'ewma_corr':
      return computeEwmaCorrelationForSeries(left, right, EWMA_LAMBDA);
    case 'tail_dep_05': {
      const leftThreshold = computeQuantileFromSorted(
        [...left].sort((a, b) => a - b),
        TAIL_PROBABILITY
      );
      const rightThreshold = computeQuantileFromSorted(
        [...right].sort((a, b) => a - b),
        TAIL_PROBABILITY
      );

      return computeEmpiricalTailDependenceForSeries(
        left,
        right,
        leftThreshold,
        rightThreshold,
        TAIL_PROBABILITY
      );
    }
    case 'nmi_hist_10': {
      const leftBinning = buildQuantileBinning(left, DEFAULT_MUTUAL_INFORMATION_BIN_COUNT);
      const rightBinning = buildQuantileBinning(right, DEFAULT_MUTUAL_INFORMATION_BIN_COUNT);

      return computeNormalizedMutualInformationForSeries(left, right, leftBinning, rightBinning);
    }
  }
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

  if (varianceLeft <= NEAR_ZERO_VARIANCE_THRESHOLD || varianceRight <= NEAR_ZERO_VARIANCE_THRESHOLD) {
    throw new Error('Encountered a near-zero-variance return series.');
  }

  const raw = covariance / Math.sqrt(varianceLeft * varianceRight);
  return clamp(raw, -1, 1);
}

export function hasSufficientVariance(values: number[], minimumVariance = 1e-20): boolean {
  const valuesMean = mean(values);
  let variance = 0;

  for (const value of values) {
    const centered = value - valuesMean;
    variance += centered * centered;
  }

  return variance > minimumVariance;
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

function prepareScoreMethodInputs(
  scoreMethod: BuildRunScoreMethod,
  symbolOrder: string[],
  returnVectorsBySymbol: Map<string, Float64Array>,
  windowDays: number
): Map<string, ScoreMethodPreparation> {
  if (scoreMethod === 'pearson_corr' || scoreMethod === 'ewma_corr') {
    return new Map<string, ScoreMethodPreparation>();
  }

  const preparations = new Map<string, ScoreMethodPreparation>();

  for (const symbol of symbolOrder) {
    const returns = returnVectorsBySymbol.get(symbol);
    if (!returns) {
      throw new Error(`Missing return vector for symbol "${symbol}".`);
    }

    const trailingReturns = extractTrailingValidValues(returns, windowDays);
    if (trailingReturns.length === 0) {
      throw new Error(`No trailing returns are available for symbol "${symbol}".`);
    }

    const preparation: ScoreMethodPreparation = {};

    if (scoreMethod === 'tail_dep_05') {
      preparation.tailThreshold = computeQuantileFromSorted(
        [...trailingReturns].sort((a, b) => a - b),
        TAIL_PROBABILITY
      );
    }

    if (scoreMethod === 'nmi_hist_10') {
      preparation.mutualInformationBinning = buildQuantileBinning(
        trailingReturns,
        DEFAULT_MUTUAL_INFORMATION_BIN_COUNT
      );
    }

    preparations.set(symbol, preparation);
  }

  return preparations;
}

function computePairScoreForMethod(args: {
  scoreMethod: BuildRunScoreMethod;
  leftReturns: Float64Array;
  rightReturns: Float64Array;
  windowDays: number;
  minimumPairOverlapCount: number;
  leftPreparation: ScoreMethodPreparation | undefined;
  rightPreparation: ScoreMethodPreparation | undefined;
}): number {
  switch (args.scoreMethod) {
    case 'pearson_corr':
      return computeTrailingOverlapPearsonCorrelation(
        args.leftReturns,
        args.rightReturns,
        args.windowDays,
        args.minimumPairOverlapCount
      );
    case 'ewma_corr':
      return computeTrailingOverlapEwmaCorrelation(
        args.leftReturns,
        args.rightReturns,
        args.windowDays,
        args.minimumPairOverlapCount,
        EWMA_LAMBDA
      );
    case 'tail_dep_05': {
      const leftThreshold = args.leftPreparation?.tailThreshold;
      const rightThreshold = args.rightPreparation?.tailThreshold;

      if (leftThreshold === undefined || rightThreshold === undefined) {
        throw new Error('Tail-dependence score preparation is missing per-symbol thresholds.');
      }

      return computeTrailingOverlapTailDependence(
        args.leftReturns,
        args.rightReturns,
        args.windowDays,
        args.minimumPairOverlapCount,
        leftThreshold,
        rightThreshold,
        TAIL_PROBABILITY
      );
    }
    case 'nmi_hist_10': {
      const leftBinning = args.leftPreparation?.mutualInformationBinning;
      const rightBinning = args.rightPreparation?.mutualInformationBinning;

      if (!leftBinning || !rightBinning) {
        throw new Error('Mutual-information score preparation is missing per-symbol binning.');
      }

      return computeTrailingOverlapNormalizedMutualInformation(
        args.leftReturns,
        args.rightReturns,
        args.windowDays,
        args.minimumPairOverlapCount,
        leftBinning,
        rightBinning
      );
    }
  }
}

function extractTrailingValidValues(values: Float64Array, limit: number): number[] {
  const extracted: number[] = [];

  for (let index = values.length - 1; index >= 0 && extracted.length < limit; index -= 1) {
    const value = values[index]!;
    if (!Number.isNaN(value)) {
      extracted.push(value);
    }
  }

  return extracted.reverse();
}

function extractTrailingOverlapObservations(
  left: Float64Array,
  right: Float64Array,
  limit: number
): { leftValues: number[]; rightValues: number[] } {
  if (left.length !== right.length) {
    throw new Error('Return vector length mismatch while computing pairwise score.');
  }

  const leftValues: number[] = [];
  const rightValues: number[] = [];

  for (let index = left.length - 1; index >= 0 && leftValues.length < limit; index -= 1) {
    const leftValue = left[index]!;
    const rightValue = right[index]!;

    if (Number.isNaN(leftValue) || Number.isNaN(rightValue)) {
      continue;
    }

    leftValues.push(leftValue);
    rightValues.push(rightValue);
  }

  leftValues.reverse();
  rightValues.reverse();

  return {
    leftValues,
    rightValues
  };
}

function computeEwmaCorrelationForSeries(
  left: number[],
  right: number[],
  lambda: number
): number {
  if (left.length !== right.length) {
    throw new Error('Return series length mismatch while computing EWMA correlation.');
  }

  let varianceLeft = 0;
  let varianceRight = 0;
  let covariance = 0;
  const alpha = 1 - lambda;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]!;
    const rightValue = right[index]!;

    varianceLeft = lambda * varianceLeft + alpha * leftValue * leftValue;
    varianceRight = lambda * varianceRight + alpha * rightValue * rightValue;
    covariance = lambda * covariance + alpha * leftValue * rightValue;
  }

  if (
    varianceLeft <= NEAR_ZERO_VARIANCE_THRESHOLD ||
    varianceRight <= NEAR_ZERO_VARIANCE_THRESHOLD
  ) {
    return 0;
  }

  const raw = covariance / Math.sqrt(varianceLeft * varianceRight);
  return clamp(raw, -1, 1);
}

function computeEmpiricalTailDependenceForSeries(
  left: number[],
  right: number[],
  leftThreshold: number,
  rightThreshold: number,
  tailProbability: number
): number {
  if (left.length !== right.length) {
    throw new Error('Return series length mismatch while computing tail dependence.');
  }

  if (left.length === 0) {
    return 0;
  }

  let jointTailCount = 0;

  for (let index = 0; index < left.length; index += 1) {
    if (left[index]! <= leftThreshold && right[index]! <= rightThreshold) {
      jointTailCount += 1;
    }
  }

  const raw = jointTailCount / (left.length * tailProbability);
  return clamp(raw, 0, 1);
}

function computeNormalizedMutualInformationForSeries(
  left: number[],
  right: number[],
  leftBinning: HistogramBinning,
  rightBinning: HistogramBinning
): number {
  if (left.length !== right.length) {
    throw new Error('Return series length mismatch while computing normalized mutual information.');
  }

  if (left.length === 0) {
    return 0;
  }

  const leftCounts = Array<number>(leftBinning.binCount).fill(0);
  const rightCounts = Array<number>(rightBinning.binCount).fill(0);
  const jointCounts = Array<number>(leftBinning.binCount * rightBinning.binCount).fill(0);

  for (let index = 0; index < left.length; index += 1) {
    const leftBin = locateHistogramBin(left[index]!, leftBinning);
    const rightBin = locateHistogramBin(right[index]!, rightBinning);

    leftCounts[leftBin] += 1;
    rightCounts[rightBin] += 1;
    jointCounts[leftBin * rightBinning.binCount + rightBin] += 1;
  }

  const total = left.length;
  const leftProbabilities = leftCounts.map((count) => count / total);
  const rightProbabilities = rightCounts.map((count) => count / total);

  const leftEntropy = leftProbabilities.reduce(
    (sum, probability) =>
      probability > 0 ? sum - probability * Math.log(probability) : sum,
    0
  );
  const rightEntropy = rightProbabilities.reduce(
    (sum, probability) =>
      probability > 0 ? sum - probability * Math.log(probability) : sum,
    0
  );

  if (
    leftEntropy <= MUTUAL_INFORMATION_ENTROPY_EPSILON ||
    rightEntropy <= MUTUAL_INFORMATION_ENTROPY_EPSILON
  ) {
    return 0;
  }

  let mutualInformation = 0;

  for (let leftBin = 0; leftBin < leftBinning.binCount; leftBin += 1) {
    for (let rightBin = 0; rightBin < rightBinning.binCount; rightBin += 1) {
      const jointProbability =
        jointCounts[leftBin * rightBinning.binCount + rightBin]! / total;

      if (jointProbability <= 0) {
        continue;
      }

      mutualInformation +=
        jointProbability *
        Math.log(
          jointProbability / (leftProbabilities[leftBin]! * rightProbabilities[rightBin]!)
        );
    }
  }

  const normalized = mutualInformation / Math.sqrt(leftEntropy * rightEntropy);
  return clamp(normalized, 0, 1);
}

function buildQuantileBinning(values: number[], binCount: number): HistogramBinning {
  if (values.length === 0) {
    throw new Error('At least one value is required to build histogram bins.');
  }

  const sorted = [...values].sort((a, b) => a - b);
  const edges = [Number.NEGATIVE_INFINITY];

  for (let bucket = 1; bucket < binCount; bucket += 1) {
    edges.push(computeQuantileFromSorted(sorted, bucket / binCount));
  }

  edges.push(Number.POSITIVE_INFINITY);

  return {
    edges,
    binCount
  };
}

function computeQuantileFromSorted(sorted: number[], quantile: number): number {
  if (sorted.length === 0) {
    throw new Error('Cannot compute a quantile from an empty series.');
  }

  if (quantile <= 0) {
    return sorted[0]!;
  }

  if (quantile >= 1) {
    return sorted[sorted.length - 1]!;
  }

  const scaledIndex = (sorted.length - 1) * quantile;
  const lowerIndex = Math.floor(scaledIndex);
  const upperIndex = Math.ceil(scaledIndex);

  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex]!;
  }

  const weight = scaledIndex - lowerIndex;
  return sorted[lowerIndex]! * (1 - weight) + sorted[upperIndex]! * weight;
}

function locateHistogramBin(value: number, binning: HistogramBinning): number {
  let low = 0;
  let high = binning.binCount - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const lowerBound = binning.edges[mid]!;
    const upperBound = binning.edges[mid + 1]!;

    if (value >= lowerBound && value < upperBound) {
      return mid;
    }

    if (value < lowerBound) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return binning.binCount - 1;
}

function mean(values: number[]): number {
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}