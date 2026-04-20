import type { TopPairItem } from '../types/api';

const CRYPTO_DATASET_PREFIX = 'crypto_';
const PERFECT_SCORE_EPSILON = 0.000001;

function getSymbolStem(symbol: string): string | null {
  const separatorIndex = symbol.indexOf('.');

  if (separatorIndex <= 0) {
    return null;
  }

  return symbol.slice(0, separatorIndex).trim().toUpperCase() || null;
}

export function isCryptoDatasetId(datasetId: string | null | undefined): boolean {
  return (datasetId ?? '').trim().toLowerCase().startsWith(CRYPTO_DATASET_PREFIX);
}

export function isCryptoSymbolCollisionPair(pair: Pick<TopPairItem, 'left' | 'right' | 'score'>): boolean {
  const leftStem = getSymbolStem(pair.left);
  const rightStem = getSymbolStem(pair.right);

  if (!leftStem || !rightStem || leftStem !== rightStem || pair.left === pair.right) {
    return false;
  }

  return Math.abs(1 - pair.score) <= PERFECT_SCORE_EPSILON;
}

export function filterMeaningfulTopPairsForDisplay(
  datasetId: string | null | undefined,
  topPairs: TopPairItem[]
): TopPairItem[] {
  if (!isCryptoDatasetId(datasetId)) {
    return topPairs;
  }

  return topPairs.filter((pair) => !isCryptoSymbolCollisionPair(pair));
}