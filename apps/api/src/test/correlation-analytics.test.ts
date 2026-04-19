import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCorrelationMatrix } from '../services/correlation-analytics.js';

function makeVector(values: Array<number | null>): Float64Array {
  const vector = new Float64Array(values.length);
  vector.fill(Number.NaN);

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value !== null) {
      vector[index] = value;
    }
  }

  return vector;
}

test('pairwise matrix uses trailing overlap instead of requiring global alignment', () => {
  const scores = buildCorrelationMatrix({
    symbolOrder: ['AAA.HK', 'BBB.HK'],
    returnVectorsBySymbol: new Map([
      ['AAA.HK', makeVector([null, 0.01, 0.02, 0.03, 0.04, null])],
      ['BBB.HK', makeVector([null, null, 0.015, 0.025, 0.035, 0.045])]
    ]),
    windowDays: 4,
    minimumPairOverlapCount: 3
  });

  assert.equal(scores.length, 2);
  assert.equal(scores[0]?.[0], 1);
  assert.equal(scores[1]?.[1], 1);
  assert.ok(Math.abs((scores[0]?.[1] ?? 0) - 1) < 1e-12);
  assert.equal(scores[0]?.[1], scores[1]?.[0]);
});

test('pairwise matrix neutralizes pairs that lack enough overlapping returns', () => {
  const scores = buildCorrelationMatrix({
    symbolOrder: ['AAA.HK', 'BBB.HK'],
    returnVectorsBySymbol: new Map([
      ['AAA.HK', makeVector([null, 0.01, null, 0.03, null])],
      ['BBB.HK', makeVector([null, null, 0.02, null, 0.04])]
    ]),
    windowDays: 3,
    minimumPairOverlapCount: 2
  });

  assert.equal(scores[0]?.[1], 0);
  assert.equal(scores[1]?.[0], 0);
});