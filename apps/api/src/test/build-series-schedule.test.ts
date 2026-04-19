import test from 'node:test';
import assert from 'node:assert/strict';

import { collapseTradingDatesToSeriesDates } from '../services/series-schedule.js';

test('collapseTradingDatesToSeriesDates keeps every dataset trading date for daily cadence', () => {
  const tradeDates = ['2026-04-13', '2026-04-14', '2026-04-16'];

  assert.deepEqual(collapseTradingDatesToSeriesDates(tradeDates, 'daily'), tradeDates);
});

test('collapseTradingDatesToSeriesDates picks the last real trading date in each week', () => {
  const tradeDates = [
    '2026-04-13',
    '2026-04-14',
    '2026-04-16',
    '2026-04-17',
    '2026-04-20',
    '2026-04-23'
  ];

  assert.deepEqual(collapseTradingDatesToSeriesDates(tradeDates, 'weekly'), [
    '2026-04-17',
    '2026-04-23'
  ]);
});

test('collapseTradingDatesToSeriesDates picks the last real trading date in each month', () => {
  const tradeDates = [
    '2026-04-27',
    '2026-04-28',
    '2026-04-29',
    '2026-04-30',
    '2026-05-04',
    '2026-05-28'
  ];

  assert.deepEqual(collapseTradingDatesToSeriesDates(tradeDates, 'monthly'), [
    '2026-04-30',
    '2026-05-28'
  ]);
});