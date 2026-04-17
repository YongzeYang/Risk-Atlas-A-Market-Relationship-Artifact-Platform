import 'dotenv/config';

import test from 'node:test';
import assert from 'node:assert/strict';
import { access, constants } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import type { FastifyInstance } from 'fastify';

import type {
  BuildRunDetailResponse,
  BuildRunListItem,
  HeatmapSubsetResponse,
  NeighborsResponse,
  PairScoreResponse
} from '../contracts/build-runs.js';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';

const repoRootDir = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const writerBinaryPath = resolve(repoRootDir, 'cpp', 'build', 'bin', 'risk_atlas_bsm_writer');

const BUILD_REQUEST = {
  datasetId: 'hk_eod_demo_v1',
  universeId: 'hk_top_20',
  asOfDate: '2026-04-15',
  windowDays: 252,
  scoreMethod: 'pearson_corr'
} as const;

test('build-runs query API smoke', async (t) => {
  await ensureSmokePrerequisites();

  const app = await buildApp();

  try {
    let buildRunId = '';
    let detail: BuildRunDetailResponse | null = null;

    await t.test('build creation succeeded', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/build-runs',
        payload: BUILD_REQUEST
      });

      assert.equal(createResponse.statusCode, 202, createResponse.body);

      const created = parseJson<BuildRunListItem>(createResponse.body);

      assert.equal(created.datasetId, BUILD_REQUEST.datasetId);
      assert.equal(created.universeId, BUILD_REQUEST.universeId);
      assert.equal(created.asOfDate, BUILD_REQUEST.asOfDate);
      assert.equal(created.windowDays, BUILD_REQUEST.windowDays);
      assert.equal(created.scoreMethod, BUILD_REQUEST.scoreMethod);
      assert.equal(created.status, 'pending');

      buildRunId = created.id;
      assert.ok(buildRunId.length > 0);

      detail = await waitForSucceededBuild(app, buildRunId);

      assert.equal(detail.id, buildRunId);
      assert.equal(detail.status, 'succeeded');
      assert.ok(detail.startedAt);
      assert.ok(detail.finishedAt);
      assert.ok(typeof detail.durationMs === 'number' && detail.durationMs >= 0);
      assert.ok(typeof detail.symbolCount === 'number' && detail.symbolCount > 0);
      assert.ok(typeof detail.minScore === 'number');
      assert.ok(typeof detail.maxScore === 'number');
      assert.ok(detail.artifact);
      assert.ok(detail.artifactDownload);
      assert.equal(detail.artifactDownload?.url, `/build-runs/${buildRunId}/download`);
      assert.ok(Array.isArray(detail.topPairs));
      assert.ok(Array.isArray(detail.symbolOrder));
      assert.ok(detail.symbolOrder.length >= 8);
    });

    await t.test('build list contains the created build', async () => {
      assert.ok(buildRunId);

      const listResponse = await app.inject({
        method: 'GET',
        url: '/build-runs'
      });

      assert.equal(listResponse.statusCode, 200, listResponse.body);

      const list = parseJson<BuildRunListItem[]>(listResponse.body);
      assert.ok(list.some((item) => item.id === buildRunId));
    });

    await t.test('pair-score endpoint is correct, self score = 1, and pair symmetry holds', async () => {
      assert.ok(detail);

      const left = '0700.HK';
      const right = '0941.HK';

      assert.ok(detail.symbolOrder.includes(left));
      assert.ok(detail.symbolOrder.includes(right));

      const pairResponse = await app.inject({
        method: 'GET',
        url: `/build-runs/${buildRunId}/pair-score?left=${left}&right=${right}`
      });

      assert.equal(pairResponse.statusCode, 200, pairResponse.body);

      const pair = parseJson<PairScoreResponse>(pairResponse.body);
      assert.equal(pair.left, left);
      assert.equal(pair.right, right);
      assert.ok(Number.isFinite(pair.score));

      const selfResponse = await app.inject({
        method: 'GET',
        url: `/build-runs/${buildRunId}/pair-score?left=${left}&right=${left}`
      });

      assert.equal(selfResponse.statusCode, 200, selfResponse.body);

      const selfPair = parseJson<PairScoreResponse>(selfResponse.body);
      assert.equal(selfPair.score, 1);

      const reverseResponse = await app.inject({
        method: 'GET',
        url: `/build-runs/${buildRunId}/pair-score?left=${right}&right=${left}`
      });

      assert.equal(reverseResponse.statusCode, 200, reverseResponse.body);

      const reversePair = parseJson<PairScoreResponse>(reverseResponse.body);
      assert.equal(reversePair.score, pair.score);

      const subsetResponse = await app.inject({
        method: 'POST',
        url: `/build-runs/${buildRunId}/heatmap-subset`,
        payload: {
          symbols: [left, right]
        }
      });

      assert.equal(subsetResponse.statusCode, 200, subsetResponse.body);

      const subset = parseJson<HeatmapSubsetResponse>(subsetResponse.body);
      assert.equal(subset.symbolOrder[0], left);
      assert.equal(subset.symbolOrder[1], right);
      assert.equal(subset.scores[0]?.[1], pair.score);
      assert.equal(subset.scores[1]?.[0], pair.score);
      assert.equal(subset.scores[0]?.[0], 1);
      assert.equal(subset.scores[1]?.[1], 1);
    });

    await t.test('neighbors endpoint is correct', async () => {
      const symbol = '0700.HK';

      const neighborsResponse = await app.inject({
        method: 'GET',
        url: `/build-runs/${buildRunId}/neighbors?symbol=${symbol}&k=5`
      });

      assert.equal(neighborsResponse.statusCode, 200, neighborsResponse.body);

      const neighbors = parseJson<NeighborsResponse>(neighborsResponse.body);

      assert.equal(neighbors.buildRunId, buildRunId);
      assert.equal(neighbors.symbol, symbol);
      assert.equal(neighbors.k, 5);
      assert.ok(neighbors.neighbors.length <= 5);
      assert.ok(neighbors.neighbors.length > 0);

      for (const entry of neighbors.neighbors) {
        assert.notEqual(entry.symbol, symbol);
        assert.ok(Number.isFinite(entry.score));
      }

      for (let i = 1; i < neighbors.neighbors.length; i += 1) {
        assert.ok(
          neighbors.neighbors[i - 1]!.score >= neighbors.neighbors[i]!.score,
          'neighbors must be sorted by descending score'
        );
      }

      const firstNeighbor = neighbors.neighbors[0]!;
      const pairResponse = await app.inject({
        method: 'GET',
        url: `/build-runs/${buildRunId}/pair-score?left=${symbol}&right=${firstNeighbor.symbol}`
      });

      assert.equal(pairResponse.statusCode, 200, pairResponse.body);

      const pair = parseJson<PairScoreResponse>(pairResponse.body);
      assert.equal(pair.score, firstNeighbor.score);
    });

    await t.test('heatmap-subset returns a symmetric matrix and preserves request order', async () => {
      assert.ok(detail);

      const symbols = detail.symbolOrder.slice(0, 8);

      const subsetResponse = await app.inject({
        method: 'POST',
        url: `/build-runs/${buildRunId}/heatmap-subset`,
        payload: {
          symbols
        }
      });

      assert.equal(subsetResponse.statusCode, 200, subsetResponse.body);

      const subset = parseJson<HeatmapSubsetResponse>(subsetResponse.body);

      assert.equal(subset.buildRunId, buildRunId);
      assert.deepEqual(subset.symbolOrder, symbols);
      assert.equal(subset.scores.length, symbols.length);

      for (let i = 0; i < subset.scores.length; i += 1) {
        assert.equal(subset.scores[i]!.length, symbols.length);
        assert.equal(subset.scores[i]![i], 1);

        for (let j = 0; j < subset.scores[i]!.length; j += 1) {
          assert.equal(subset.scores[i]![j], subset.scores[j]![i]);
        }
      }
    });
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
});

async function ensureSmokePrerequisites(): Promise<void> {
  await access(writerBinaryPath, constants.X_OK).catch(() => {
    throw new Error(
      `BSM writer binary not found or not executable at ${writerBinaryPath}. ` +
        `Build it first from the repository root, then rerun the smoke test.`
    );
  });

  const [dataset, universe] = await Promise.all([
    prisma.dataset.findUnique({
      where: { id: BUILD_REQUEST.datasetId },
      select: { id: true }
    }),
    prisma.universe.findUnique({
      where: { id: BUILD_REQUEST.universeId },
      select: { id: true }
    })
  ]);

  if (!dataset || !universe) {
    throw new Error(
      `Smoke test seed data is missing. Run "pnpm db:seed" in apps/api first.`
    );
  }
}

async function waitForSucceededBuild(
  app: FastifyInstance,
  buildRunId: string
): Promise<BuildRunDetailResponse> {
  const timeoutMs = 30_000;
  const pollIntervalMs = 250;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await app.inject({
      method: 'GET',
      url: `/build-runs/${buildRunId}`
    });

    assert.equal(response.statusCode, 200, response.body);

    const detail = parseJson<BuildRunDetailResponse>(response.body);

    if (detail.status === 'succeeded') {
      return detail;
    }

    if (detail.status === 'failed') {
      assert.fail(
        `Build "${buildRunId}" failed during smoke test: ${detail.errorMessage ?? 'unknown error'}`
      );
    }

    await sleep(pollIntervalMs);
  }

  assert.fail(`Timed out waiting for build "${buildRunId}" to succeed.`);
}

function parseJson<T>(text: string): T {
  return JSON.parse(text) as T;
}