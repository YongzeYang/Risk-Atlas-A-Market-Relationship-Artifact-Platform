import 'dotenv/config';

import test from 'node:test';
import assert from 'node:assert/strict';
import { access, constants } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import type { FastifyInstance } from 'fastify';

import type {
  AnalysisRunDetailResponse,
  AnalysisRunListItem,
  ExposureAnalysisRunListItem,
  PairDivergenceAnalysisRunListItem,
  StructureAnalysisRunListItem
} from '../contracts/analysis-runs.js';
import type {
  BuildRequestValidationResponse,
  BuildRunDetailResponse,
  BuildRunListItem,
  BuildSeriesDetailResponse,
  BuildSeriesListItem,
  CompareBuildStructuresResponse,
  ExposureResponse,
  HeatmapSubsetResponse,
  NeighborsResponse,
  PairDivergenceResponse,
  PairScoreResponse
} from '../contracts/build-runs.js';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { getBuildRequestValidationForResolvedUniverse } from '../services/build-request-validation-service.js';

const repoRootDir = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const writerBinaryPath = resolve(repoRootDir, 'cpp', 'build', 'bin', 'risk_atlas_bsm_writer');
const queryBinaryPath = resolve(repoRootDir, 'cpp', 'build', 'bin', 'risk_atlas_bsm_query');
const INVITE_CODE = 'risk-atlas-demo-2026';
const PRIMARY_SMOKE_DATASET_ID = 'hk_eod_yahoo_real_v1';
const FALLBACK_SMOKE_DATASET_ID = 'hk_eod_demo_v1';
const ANALYSIS_HEADERS = {
  'x-invite-code': INVITE_CODE
} as const;
const MIN_SMOKE_SYMBOL_COUNT = 12;
const PREFERRED_SMOKE_UNIVERSE_IDS = [
  'hk_top_20',
  'hk_financials_10',
  'hk_top_50_liquid',
  'hk_top_200_liquid',
  'hk_real_yahoo_300',
  'hk_real_yahoo_500',
  'hk_real_yahoo_1000',
  'hk_all_common_equity',
  'hk_financials',
  'hk_tech',
  'hk_property',
  'hk_consumer',
  'hk_industrials',
  'hk_energy',
  'hk_telecom',
  'hk_utilities'
] as const;

const BUILD_REQUEST_TEMPLATE = {
  windowDays: 252,
  scoreMethod: 'pearson_corr',
  inviteCode: INVITE_CODE
} as const;

type SmokeDatasetId =
  | typeof PRIMARY_SMOKE_DATASET_ID
  | typeof FALLBACK_SMOKE_DATASET_ID;

type SmokeBuildPrerequisites = {
  datasetId: SmokeDatasetId;
  universeId: string;
  asOfDate: string;
  invalidAsOfDate: string;
};

test('build-runs query API smoke', async (t) => {
  const smoke = await ensureSmokePrerequisites();
  const buildRequest = {
    ...BUILD_REQUEST_TEMPLATE,
    datasetId: smoke.datasetId,
    universeId: smoke.universeId,
    asOfDate: smoke.asOfDate
  } as const;

  const app = await buildApp();

  try {
    let buildRunId = '';
    let detail: BuildRunDetailResponse | null = null;
    let secondBuildRunId = '';

    await t.test('build creation succeeded', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/build-runs',
        payload: buildRequest
      });

      assert.equal(createResponse.statusCode, 202, createResponse.body);

      const created = parseJson<BuildRunListItem>(createResponse.body);

      assert.equal(created.datasetId, buildRequest.datasetId);
      assert.equal(created.universeId, buildRequest.universeId);
      assert.equal(created.asOfDate, buildRequest.asOfDate);
      assert.equal(created.windowDays, buildRequest.windowDays);
      assert.equal(created.scoreMethod, buildRequest.scoreMethod);
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

    await t.test('build validation reports valid and invalid requests explicitly', async () => {
      const validResponse = await app.inject({
        method: 'POST',
        url: '/build-runs/validate',
        payload: {
          datasetId: buildRequest.datasetId,
          universeId: buildRequest.universeId,
          asOfDate: buildRequest.asOfDate,
          windowDays: buildRequest.windowDays
        }
      });

      assert.equal(validResponse.statusCode, 200, validResponse.body);

      const valid = parseJson<BuildRequestValidationResponse>(validResponse.body);
      assert.equal(valid.valid, true);
      assert.equal(valid.reasonCode, 'ok');
      assert.ok(
        typeof valid.resolvedSymbolCount === 'number' &&
          valid.resolvedSymbolCount >= MIN_SMOKE_SYMBOL_COUNT
      );
      assert.equal(valid.requiredRows, 253);

      const invalidResponse = await app.inject({
        method: 'POST',
        url: '/build-runs/validate',
        payload: {
          datasetId: buildRequest.datasetId,
          universeId: buildRequest.universeId,
          asOfDate: smoke.invalidAsOfDate,
          windowDays: buildRequest.windowDays
        }
      });

      assert.equal(invalidResponse.statusCode, 200, invalidResponse.body);

      const invalid = parseJson<BuildRequestValidationResponse>(invalidResponse.body);
      assert.equal(invalid.valid, false);
      assert.ok(
        invalid.reasonCode === 'insufficient_history' || invalid.reasonCode === 'universe_size'
      );
      assert.match(invalid.message ?? '', /history|resolved/i);
      assert.equal(invalid.requiredRows, 253);
    });

    await t.test('build series uses real trading dates for weekly cadence', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/build-series',
        payload: {
          name: 'smoke-weekly-series',
          datasetId: buildRequest.datasetId,
          universeId: buildRequest.universeId,
          windowDays: buildRequest.windowDays,
          scoreMethod: buildRequest.scoreMethod,
          startDate: '2026-04-08',
          endDate: '2026-04-15',
          frequency: 'weekly',
          inviteCode: INVITE_CODE
        }
      });

      assert.equal(createResponse.statusCode, 202, createResponse.body);

      const created = parseJson<BuildSeriesListItem>(createResponse.body);
      assert.equal(created.frequency, 'weekly');
      assert.equal(created.totalRunCount, 2);

      const detailResponse = await app.inject({
        method: 'GET',
        url: `/build-series/${created.id}`
      });

      assert.equal(detailResponse.statusCode, 200, detailResponse.body);

      const detail = parseJson<BuildSeriesDetailResponse>(detailResponse.body);
      assert.deepEqual(
        detail.runs.map((run) => run.asOfDate),
        ['2026-04-10', '2026-04-15']
      );
    });

    await t.test('pair-score endpoint is correct, self score = 1, and pair symmetry holds', async () => {
      assert.ok(detail);

      const [left, right] = detail.symbolOrder;

      assert.ok(left);
      assert.ok(right);
      assert.notEqual(left, right);

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
      assert.ok(detail);

      const symbol = detail.symbolOrder[0]!;

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

    await t.test('pair-divergence returns ranked candidates with recent metrics', async () => {
      const divergenceResponse = await app.inject({
        method: 'GET',
        url:
          `/build-runs/${buildRunId}/pair-divergence?recentWindowDays=20&limit=10` +
          `&minLongCorrAbs=0.15&minCorrDeltaAbs=0.05`
      });

      assert.equal(divergenceResponse.statusCode, 200, divergenceResponse.body);

      const divergence = parseJson<PairDivergenceResponse>(divergenceResponse.body);

      assert.equal(divergence.buildRunId, buildRunId);
      assert.equal(divergence.asOfDate, buildRequest.asOfDate);
      assert.equal(divergence.longWindowDays, buildRequest.windowDays);
      assert.equal(divergence.recentWindowDays, 20);
      assert.ok(divergence.candidateCount >= divergence.candidates.length);
      assert.ok(divergence.candidates.length > 0);

      for (const candidate of divergence.candidates) {
        assert.ok(Number.isFinite(candidate.longWindowCorr));
        assert.ok(Number.isFinite(candidate.recentCorr));
        assert.ok(Number.isFinite(candidate.corrDelta));
        assert.ok(Number.isFinite(candidate.recentRelativeReturnGap));

        if (candidate.spreadZScore !== null) {
          assert.ok(Number.isFinite(candidate.spreadZScore));
        }
      }

      for (let i = 1; i < divergence.candidates.length; i += 1) {
        assert.ok(
          Math.abs(divergence.candidates[i - 1]!.corrDelta) >=
            Math.abs(divergence.candidates[i]!.corrDelta),
          'pair-divergence candidates must be sorted by absolute corr delta'
        );
      }
    });

    await t.test('queued pair-divergence run persists and can be listed later', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/analysis-runs/pair-divergence',
        headers: ANALYSIS_HEADERS,
        payload: {
          buildRunId,
          recentWindowDays: 20,
          limit: 10,
          minLongCorrAbs: 0.15,
          minCorrDeltaAbs: 0.05
        }
      });

      assert.equal(createResponse.statusCode, 202, createResponse.body);

      const created = parseJson<PairDivergenceAnalysisRunListItem>(createResponse.body);
      assert.equal(created.kind, 'pair_divergence');
      assert.equal(created.buildRunId, buildRunId);
      assert.ok(created.id.length > 0);

      const completed = await waitForSucceededAnalysisRun(app, created.id);
      assert.equal(completed.kind, 'pair_divergence');
      assert.ok(completed.result);
      assert.ok(completed.result.candidateCount >= completed.result.candidates.length);

      const listResponse = await app.inject({
        method: 'GET',
        url: `/analysis-runs?kind=pair_divergence&buildRunId=${buildRunId}`
      });

      assert.equal(listResponse.statusCode, 200, listResponse.body);

      const list = parseJson<AnalysisRunListItem[]>(listResponse.body);
      assert.ok(list.some((item) => item.id === created.id));
    });

    await t.test('exposure returns sector aggregation and concentration metrics', async () => {
      assert.ok(detail);

      const symbol = detail.symbolOrder[0]!;

      const exposureResponse = await app.inject({
        method: 'GET',
        url: `/build-runs/${buildRunId}/exposure?symbol=${symbol}&k=10`
      });

      assert.equal(exposureResponse.statusCode, 200, exposureResponse.body);

      const exposure = parseJson<ExposureResponse>(exposureResponse.body);

      assert.equal(exposure.buildRunId, buildRunId);
      assert.equal(exposure.symbol, symbol);
      assert.ok(exposure.neighborCount > 0);
      assert.ok(exposure.neighbors.length > 0);
      assert.ok(exposure.sectors.length > 0);
      assert.ok(exposure.concentrationIndex >= 0);
      assert.ok(exposure.effectiveNeighborCount >= 0);

      const weightShareSum = exposure.sectors.reduce((sum, entry) => sum + entry.weightShare, 0);
      assert.ok(Math.abs(weightShareSum - 1) < 1e-6 || weightShareSum === 0);
    });

    await t.test('queued exposure run persists its result', async () => {
      assert.ok(detail);

      const symbol = detail.symbolOrder[0]!;

      const createResponse = await app.inject({
        method: 'POST',
        url: '/analysis-runs/exposure',
        headers: ANALYSIS_HEADERS,
        payload: {
          buildRunId,
          symbol,
          k: 10
        }
      });

      assert.equal(createResponse.statusCode, 202, createResponse.body);

      const created = parseJson<ExposureAnalysisRunListItem>(createResponse.body);
      assert.equal(created.kind, 'exposure');
      assert.equal(created.buildRunId, buildRunId);

      const completed = await waitForSucceededAnalysisRun(app, created.id);
      assert.equal(completed.kind, 'exposure');
      assert.ok(completed.result);
      assert.equal(completed.result.symbol, symbol);
      assert.ok(completed.result.neighborCount > 0);
    });

    await t.test('structure returns ordered heatmap metadata and cluster summaries', async () => {
      const structureResponse = await app.inject({
        method: 'GET',
        url: `/build-runs/${buildRunId}/structure?heatmapSize=12`
      });

      assert.equal(structureResponse.statusCode, 200, structureResponse.body);

      const structure = parseJson<{
        buildRunId: string;
        symbolCount: number;
        clusterCount: number;
        orderedSymbols: string[];
        heatmapSymbols: string[];
        heatmapScores: number[][];
        clusters: Array<{ id: number; size: number; symbols: string[] }>;
      }>(structureResponse.body);

      assert.equal(structure.buildRunId, buildRunId);
      assert.ok(structure.clusterCount > 0);
      assert.equal(structure.orderedSymbols.length, structure.symbolCount);
      assert.ok(structure.heatmapSymbols.length > 0);
      assert.equal(structure.heatmapScores.length, structure.heatmapSymbols.length);
      assert.ok(structure.clusters.length > 0);
    });

    await t.test('queued structure run persists ordered structure output', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/analysis-runs/structure',
        headers: ANALYSIS_HEADERS,
        payload: {
          buildRunId,
          heatmapSize: 12
        }
      });

      assert.equal(createResponse.statusCode, 202, createResponse.body);

      const created = parseJson<StructureAnalysisRunListItem>(createResponse.body);
      assert.equal(created.kind, 'structure');
      assert.equal(created.buildRunId, buildRunId);

      const completed = await waitForSucceededAnalysisRun(app, created.id);
      assert.equal(completed.kind, 'structure');
      assert.ok(completed.result);
      assert.ok(completed.result.clusterCount > 0);
      assert.ok(completed.result.heatmapSymbols.length > 0);
    });

    await t.test('compare-builds is query-only and returns pair drift without invite', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/build-runs',
        payload: buildRequest
      });

      assert.equal(createResponse.statusCode, 202, createResponse.body);
      secondBuildRunId = parseJson<BuildRunListItem>(createResponse.body).id;
      await waitForSucceededBuild(app, secondBuildRunId);

      const compareResponse = await app.inject({
        method: 'GET',
        url: `/compare-builds?leftId=${buildRunId}&rightId=${secondBuildRunId}`
      });

      assert.equal(compareResponse.statusCode, 200, compareResponse.body);

      const compare = parseJson<{
        left: { id: string };
        right: { id: string };
        commonSymbols: string[];
        topDriftPairs: Array<{ left: string; right: string; delta: number }>;
      }>(compareResponse.body);

      assert.equal(compare.left.id, buildRunId);
      assert.equal(compare.right.id, secondBuildRunId);
      assert.ok(compare.commonSymbols.length > 0);
      assert.ok(compare.topDriftPairs.length > 0);
    });

    await t.test('compare-build-structures reports drift summary between two builds', async () => {
      if (!secondBuildRunId) {
        const createResponse = await app.inject({
          method: 'POST',
          url: '/build-runs',
          payload: buildRequest
        });

        assert.equal(createResponse.statusCode, 202, createResponse.body);
        secondBuildRunId = parseJson<BuildRunListItem>(createResponse.body).id;
        await waitForSucceededBuild(app, secondBuildRunId);
      }

      const compareResponse = await app.inject({
        method: 'GET',
        url: `/compare-build-structures?leftId=${buildRunId}&rightId=${secondBuildRunId}`
      });

      assert.equal(compareResponse.statusCode, 200, compareResponse.body);

      const compare = parseJson<CompareBuildStructuresResponse>(compareResponse.body);
      assert.equal(compare.left.id, buildRunId);
      assert.equal(compare.right.id, secondBuildRunId);
      assert.ok(compare.commonSymbolCount > 0);
      assert.equal(
        compare.stableSymbolCount + compare.changedSymbolCount,
        compare.commonSymbolCount
      );
    });
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
});

async function ensureSmokePrerequisites(): Promise<SmokeBuildPrerequisites> {
  await access(writerBinaryPath, constants.X_OK).catch(() => {
    throw new Error(
      `BSM writer binary not found or not executable at ${writerBinaryPath}. ` +
        `Build it first from the repository root, then rerun the smoke test.`
    );
  });

  await access(queryBinaryPath, constants.X_OK).catch(() => {
    throw new Error(
      `BSM query binary not found or not executable at ${queryBinaryPath}. ` +
        `Build it first from the repository root, then rerun the smoke test.`
    );
  });

  const [datasets, universes] = await Promise.all([
    prisma.dataset.findMany({
      where: {
        id: {
          in: [PRIMARY_SMOKE_DATASET_ID, FALLBACK_SMOKE_DATASET_ID]
        }
      },
      select: {
        id: true,
        market: true,
        catalogMaxTradeDate: true,
        catalogFirstValidAsOf252: true
      }
    }),
    prisma.universe.findMany({
      select: {
        id: true,
        market: true,
        definitionKind: true,
        symbolsJson: true,
        definitionParams: true,
        symbolCount: true
      }
    })
  ]);

  const dataset =
    datasets.find((entry) => entry.id === PRIMARY_SMOKE_DATASET_ID) ??
    datasets.find((entry) => entry.id === FALLBACK_SMOKE_DATASET_ID) ??
    null;

  if (!dataset) {
    throw new Error(
      `Smoke test seed data is missing. Run "pnpm db:seed" in apps/api first.`
    );
  }

  if (!dataset.catalogMaxTradeDate || !dataset.catalogFirstValidAsOf252) {
    throw new Error(
      `Dataset "${dataset.id}" is missing catalog coverage metadata. Rerun "pnpm db:seed" first.`
    );
  }

  const orderedUniverses = [...universes]
    .filter((universe) => universe.market === dataset.market)
    .sort((left, right) => {
      const rankDifference = getSmokeUniverseRank(left.id) - getSmokeUniverseRank(right.id);
      if (rankDifference !== 0) {
        return rankDifference;
      }

      const leftSymbolCount = left.symbolCount ?? Number.MAX_SAFE_INTEGER;
      const rightSymbolCount = right.symbolCount ?? Number.MAX_SAFE_INTEGER;
      if (leftSymbolCount !== rightSymbolCount) {
        return leftSymbolCount - rightSymbolCount;
      }

      return left.id.localeCompare(right.id);
    });

  for (const universe of orderedUniverses) {
    const validation = await getBuildRequestValidationForResolvedUniverse({
      dataset: {
        id: dataset.id,
        market: dataset.market
      },
      universe,
      asOfDate: dataset.catalogMaxTradeDate,
      windowDays: BUILD_REQUEST_TEMPLATE.windowDays
    });

    if (validation.valid && (validation.resolvedSymbolCount ?? 0) >= MIN_SMOKE_SYMBOL_COUNT) {
      return {
        datasetId: dataset.id as SmokeDatasetId,
        universeId: universe.id,
        asOfDate: dataset.catalogMaxTradeDate,
        invalidAsOfDate: shiftIsoDate(dataset.catalogFirstValidAsOf252, -1)
      };
    }
  }

  throw new Error(
    `No buildable smoke-test universe with at least ${MIN_SMOKE_SYMBOL_COUNT} symbols was found for dataset "${dataset.id}".`
  );
}

function getSmokeUniverseRank(universeId: string): number {
  const rank = PREFERRED_SMOKE_UNIVERSE_IDS.indexOf(
    universeId as (typeof PREFERRED_SMOKE_UNIVERSE_IDS)[number]
  );

  return rank === -1 ? PREFERRED_SMOKE_UNIVERSE_IDS.length : rank;
}

function shiftIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

async function waitForSucceededAnalysisRun(
  app: FastifyInstance,
  runId: string
): Promise<AnalysisRunDetailResponse> {
  const timeoutMs = 30_000;
  const pollIntervalMs = 250;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await app.inject({
      method: 'GET',
      url: `/analysis-runs/${runId}`
    });

    assert.equal(response.statusCode, 200, response.body);

    const detail = parseJson<AnalysisRunDetailResponse>(response.body);

    if (detail.status === 'succeeded') {
      return detail;
    }

    if (detail.status === 'failed') {
      assert.fail(
        `Analysis run "${runId}" failed during smoke test: ${detail.errorMessage ?? 'unknown error'}`
      );
    }

    await sleep(pollIntervalMs);
  }

  assert.fail(`Timed out waiting for analysis run "${runId}" to succeed.`);
}

function parseJson<T>(text: string): T {
  return JSON.parse(text) as T;
}