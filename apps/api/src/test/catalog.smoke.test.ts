import 'dotenv/config';

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildApp } from '../app.js';
import type { DatasetListItem, UniverseListItem } from '../services/catalog-service.js';

test('catalog endpoints return lightweight summaries for datasets and universes', async () => {
  const app = await buildApp();

  try {
    const datasetsResponse = await app.inject({
      method: 'GET',
      url: '/datasets'
    });

    assert.equal(datasetsResponse.statusCode, 200, datasetsResponse.body);

    const datasets = JSON.parse(datasetsResponse.body) as DatasetListItem[];
    assert.ok(datasets.length > 0);

    const dataset = datasets.find((item) => item.id === 'hk_eod_demo_v1') ?? datasets[0]!;
    assert.ok(typeof dataset.priceRowCount === 'number');
    assert.ok(typeof dataset.symbolCount === 'number');
    assert.ok(Object.prototype.hasOwnProperty.call(dataset.firstValidAsOfByWindowDays, '60'));
    assert.ok(Object.prototype.hasOwnProperty.call(dataset.firstValidAsOfByWindowDays, '120'));
    assert.ok(Object.prototype.hasOwnProperty.call(dataset.firstValidAsOfByWindowDays, '252'));

    const universesResponse = await app.inject({
      method: 'GET',
      url: '/universes'
    });

    assert.equal(universesResponse.statusCode, 200, universesResponse.body);

    const universes = JSON.parse(universesResponse.body) as UniverseListItem[];
    assert.ok(universes.length > 0);

    const sameMarketUniverses = universes.filter((item) => item.market === dataset.market);
    assert.ok(sameMarketUniverses.length > 0);

    for (const universe of sameMarketUniverses) {
      assert.ok(Array.isArray(universe.supportedDatasetIds));
      assert.ok(universe.supportedDatasetIds.includes(dataset.id));
    }
  } finally {
    await app.close();
  }
});