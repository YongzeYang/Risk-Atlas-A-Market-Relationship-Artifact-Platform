import type { BuildRunListItem } from '../types/api';

const FEATURED_UNIVERSE_IDS = [
  'hk_top_50_liquid',
  'hk_all_common_equity',
  'hk_financials',
  'hk_tech',
  'crypto_top_50_liquid',
  'crypto_market_map_all',
  'crypto_platform',
  'crypto_defi'
];

function universePreference(universeId: string): number {
  const index = FEATURED_UNIVERSE_IDS.indexOf(universeId);
  return index === -1 ? FEATURED_UNIVERSE_IDS.length : index;
}

function lookbackPreference(windowDays: number): number {
  if (windowDays >= 252) {
    return 0;
  }

  if (windowDays >= 120) {
    return 1;
  }

  return 2;
}

function compareFeaturedBuilds(left: BuildRunListItem, right: BuildRunListItem): number {
  const universeCompare = universePreference(left.universeId) - universePreference(right.universeId);
  if (universeCompare !== 0) {
    return universeCompare;
  }

  const lookbackCompare = lookbackPreference(left.windowDays) - lookbackPreference(right.windowDays);
  if (lookbackCompare !== 0) {
    return lookbackCompare;
  }

  const asOfCompare = right.asOfDate.localeCompare(left.asOfDate);
  if (asOfCompare !== 0) {
    return asOfCompare;
  }

  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function normalizedUniverseLabel(universeLabel: string): string {
  return universeLabel.trim().toLowerCase();
}

export function pickFeaturedBuild(buildRuns: BuildRunListItem[]): BuildRunListItem | null {
  const readyBuilds = buildRuns.filter((item) => item.status === 'succeeded');

  if (readyBuilds.length === 0) {
    return null;
  }

  return [...readyBuilds].sort(compareFeaturedBuilds)[0] ?? null;
}

export function pickComparisonBuildPair(
  buildRuns: BuildRunListItem[]
): [BuildRunListItem, BuildRunListItem] | null {
  const readyBuilds = buildRuns.filter((item) => item.status === 'succeeded');
  const rankedBuilds = [...readyBuilds].sort(compareFeaturedBuilds);

  for (const left of rankedBuilds) {
    const right = rankedBuilds.find(
      (item) => item.id !== left.id && item.universeId === left.universeId
    );

    if (right) {
      return [left, right];
    }
  }

  if (rankedBuilds.length >= 2) {
    return [rankedBuilds[0], rankedBuilds[1]];
  }

  return null;
}

export function describeSnapshotHint(
  buildRun: BuildRunListItem,
  universeLabel: string
): string {
  if (buildRun.status === 'failed') {
    return 'This snapshot did not finish. Open it if you need the setup context or failure details.';
  }

  if (buildRun.status === 'pending' || buildRun.status === 'running') {
    return 'This snapshot is still being prepared. You can open it now and come back when the read is ready.';
  }

  const label = normalizedUniverseLabel(universeLabel);

  if (label.includes('top 50') || label.includes('large cap')) {
    return 'Useful when you want a fast read on whether a broad large-cap basket is less diversified than it looks.';
  }

  if (label.includes('all common') || label.includes('whole market')) {
    return 'Useful when you want a broad market snapshot before drilling into one sector or one name.';
  }

  if (label.includes('financial')) {
    return 'Useful when you want to see whether financial names are clustering more tightly than the labels suggest.';
  }

  if (label.includes('tech')) {
    return 'Useful when you want to check whether growth names are moving like one crowded trade.';
  }

  if (label.includes('defi')) {
    return 'Useful when you want to see whether on-chain financial protocols are behaving like one crowded risk pocket.';
  }

  if (label.includes('platform') || label.includes('layer 1') || label.includes('layer1')) {
    return 'Useful when you want to see whether core network assets are moving as one shared infrastructure bloc.';
  }

  if (label.includes('exchange')) {
    return 'Useful when you want to isolate venue and trading-stack tokens from the broader crypto tape.';
  }

  if (label.includes('meme')) {
    return 'Useful when you want to test whether reflexive retail momentum is clustering into one high-beta pocket.';
  }

  if (label.includes('property') || label.includes('real estate')) {
    return 'Useful when you want to see whether property risk is spreading across the basket.';
  }

  if (label.includes('energy')) {
    return 'Useful when you want to see whether commodity-linked names are moving as one pocket of risk.';
  }

  return 'Open this snapshot to inspect overlap, related names, spillover, and hidden groups.';
}

export function describeExampleSnapshotBullets(
  buildRun: BuildRunListItem,
  universeLabel: string,
  topPairLabel?: string | null,
  symbolCount?: number | null
): string[] {
  const bullets = [describeSnapshotHint(buildRun, universeLabel)];

  if (topPairLabel) {
    bullets.push(`${topPairLabel} are one of the closest relationships in this snapshot.`);
  }

  if (typeof symbolCount === 'number' && symbolCount > 0) {
    bullets.push(
      `This read covers ${symbolCount} names, so you can judge basket structure rather than a single pair in isolation.`
    );
  } else if (buildRun.windowDays >= 252) {
    bullets.push('The longer lookback makes it easier to see the basket’s deeper structure, not just the latest noise.');
  } else {
    bullets.push('The shorter lookback keeps the read closer to recent market behaviour.');
  }

  bullets.push('Open this snapshot to inspect overlap, spillover, and hidden groups.');

  return bullets.slice(0, 3);
}

export function summarizeBuildFailure(errorMessage: string): string {
  const message = errorMessage.trim();

  if (/invite code/i.test(message)) {
    return 'This snapshot could not start because the invite code was missing or invalid.';
  }

  if (/not enough history|insufficient history/i.test(message)) {
    return 'This setup did not have enough history to build the requested lookback.';
  }

  if (/market mismatch/i.test(message)) {
    return 'This basket and data source did not line up for the same market.';
  }

  if (/symbol count/i.test(message)) {
    return 'This basket did not leave a usable number of names after filtering.';
  }

  return message;
}