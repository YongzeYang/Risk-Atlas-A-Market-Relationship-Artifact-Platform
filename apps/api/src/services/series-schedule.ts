import type { BuildSeriesFrequency } from '../contracts/build-runs.js';

export function collapseTradingDatesToSeriesDates(
  tradeDates: string[],
  frequency: BuildSeriesFrequency
): string[] {
  if (frequency === 'daily') {
    return [...tradeDates];
  }

  const scheduledDates: string[] = [];
  let currentBucket: string | null = null;
  let lastTradingDateInBucket: string | null = null;

  for (const tradeDate of tradeDates) {
    const bucket = frequency === 'weekly' ? getIsoWeekBucket(tradeDate) : tradeDate.slice(0, 7);

    if (currentBucket !== bucket) {
      if (lastTradingDateInBucket) {
        scheduledDates.push(lastTradingDateInBucket);
      }

      currentBucket = bucket;
    }

    lastTradingDateInBucket = tradeDate;
  }

  if (lastTradingDateInBucket) {
    scheduledDates.push(lastTradingDateInBucket);
  }

  return scheduledDates;
}

function getIsoWeekBucket(isoDate: string): string {
  const date = parseIsoDateUtc(isoDate);
  const weekday = date.getUTCDay();
  const diffToMonday = (weekday + 6) % 7;

  date.setUTCDate(date.getUTCDate() - diffToMonday);

  return formatIsoDate(date);
}

function parseIsoDateUtc(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}