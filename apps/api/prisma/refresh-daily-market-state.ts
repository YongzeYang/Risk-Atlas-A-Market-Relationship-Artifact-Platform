import 'dotenv/config';

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type { Prisma } from '@prisma/client';

import { disconnectPrisma, prisma } from '../src/lib/prisma.js';
import {
  BUILD_RUN_SCORE_METHODS,
  type BuildRunScoreMethod,
  type BuildRunWindowDays
} from '../src/contracts/build-runs.js';
import { validateBuildRequestCoverage } from '../src/services/build-request-validation-service.js';
import { runBuild } from '../src/services/build-run-runner.js';

const DAILY_REFRESH_LOCK_KEY_1 = 7101;
const DAILY_REFRESH_LOCK_KEY_2 = 1;

const HK_REAL_DATASET_ID = 'hk_eod_yahoo_real_v1';
const HK_DEMO_DATASET_ID = 'hk_eod_demo_v1';
const HK_UNIVERSE_ID = 'hk_all_common_equity';

const CRYPTO_DATASET_ID = 'crypto_market_map_yahoo_v2';
const CRYPTO_UNIVERSE_ID = 'crypto_market_map_all';

const SNAPSHOT_WINDOW_DAYS: BuildRunWindowDays = 252;

const RUN_HK_REFRESH = (process.env.RISK_ATLAS_DAILY_REFRESH_RUN_HK ?? '1').trim() !== '0';
const RUN_CRYPTO_REFRESH = (process.env.RISK_ATLAS_DAILY_REFRESH_RUN_CRYPTO ?? '1').trim() !== '0';
const BUILD_DAILY_SNAPSHOTS =
  (process.env.RISK_ATLAS_DAILY_REFRESH_BUILD_SNAPSHOTS ?? '0').trim() !== '0';

type DatasetCatalogRow = {
  id: string;
  name: string;
  market: string;
  catalogPriceRowCount: bigint;
  catalogMaxTradeDate: string | null;
};

type UniverseValidationRow = {
  id: string;
  market?: string;
  definitionKind: string;
  symbolsJson: Prisma.JsonValue;
  definitionParams: Prisma.JsonValue;
};

type SnapshotPlan = {
  marketLabel: 'hk' | 'crypto';
  datasetId: string;
  universeId: string;
  asOfDate: string;
  windowDays: BuildRunWindowDays;
  scoreMethod: BuildRunScoreMethod;
};

type SnapshotBuildSummary = {
  marketLabel: 'hk' | 'crypto';
  datasetId: string;
  universeId: string;
  asOfDate: string;
  windowDays: BuildRunWindowDays;
  scoreMethod: BuildRunScoreMethod;
  buildRunId: string;
  reusedExistingBuild: boolean;
};

async function main() {
  const lockAcquired = await tryAcquireDailyRefreshLock();
  if (!lockAcquired) {
    console.log('Another daily market refresh is already running. Exiting without error.');
    return;
  }

  try {
    console.log('Starting daily market refresh for HK + crypto snapshot coverage.');

    const refreshSteps: string[] = [];

    if (RUN_HK_REFRESH) {
      await ensureHongKongSeedPrerequisites();
      refreshSteps.push('hk_refresh');
      await runPrismaScript('prisma/real-hk-benchmark.ts', ['--skip-benchmarks'], {
        RISK_ATLAS_IMPORT_EOD_MODE: 'merge',
        RISK_ATLAS_SKIP_ALIGNMENT_AUDIT: '1'
      });
    } else {
      console.log('Skipping HK refresh because RISK_ATLAS_DAILY_REFRESH_RUN_HK=0.');
    }

    if (RUN_CRYPTO_REFRESH) {
      refreshSteps.push('crypto_refresh');
      await runPrismaScript('prisma/import-crypto-market-map.ts', [], {
        CRYPTO_MARKET_MAP_SKIP_VERIFICATION_BUILD: '1',
        RISK_ATLAS_IMPORT_EOD_MODE: 'merge'
      });
    } else {
      console.log('Skipping crypto refresh because RISK_ATLAS_DAILY_REFRESH_RUN_CRYPTO=0.');
    }

    if (!BUILD_DAILY_SNAPSHOTS) {
      console.log(
        'Skipping daily snapshot builds because RISK_ATLAS_DAILY_REFRESH_BUILD_SNAPSHOTS=0. ' +
          'Daily refresh will update datasets only.'
      );

      console.log(
        JSON.stringify(
          {
            refreshSteps,
            buildSnapshots: false,
            snapshotCount: 0,
            summaries: []
          },
          null,
          2
        )
      );

      return;
    }

    const hkDataset = await ensureHongKongDatasetReady();
    const cryptoDataset = await ensureCryptoDatasetReady();

    const snapshotPlans: SnapshotPlan[] = [
      ...BUILD_RUN_SCORE_METHODS.map((scoreMethod) => ({
        marketLabel: 'hk' as const,
        datasetId: hkDataset.id,
        universeId: HK_UNIVERSE_ID,
        asOfDate: requireCatalogMaxTradeDate(hkDataset, 'Hong Kong dataset'),
        windowDays: SNAPSHOT_WINDOW_DAYS,
        scoreMethod
      })),
      ...BUILD_RUN_SCORE_METHODS.map((scoreMethod) => ({
        marketLabel: 'crypto' as const,
        datasetId: cryptoDataset.id,
        universeId: CRYPTO_UNIVERSE_ID,
        asOfDate: requireCatalogMaxTradeDate(cryptoDataset, 'Crypto dataset'),
        windowDays: SNAPSHOT_WINDOW_DAYS,
        scoreMethod
      }))
    ];

    console.log(
      `Prepared ${snapshotPlans.length} daily snapshot plans ` +
        `(markets=2, scoreMethods=${BUILD_RUN_SCORE_METHODS.length}, windowDays=${SNAPSHOT_WINDOW_DAYS}).`
    );

    const summaries: SnapshotBuildSummary[] = [];

    for (let index = 0; index < snapshotPlans.length; index += 1) {
      const plan = snapshotPlans[index]!;

      console.log(
        `Running daily snapshot ${index + 1}/${snapshotPlans.length}: ` +
          `${plan.marketLabel} ${plan.scoreMethod} ` +
          `(dataset=${plan.datasetId}, universe=${plan.universeId}, asOfDate=${plan.asOfDate}).`
      );

      summaries.push(await ensureSnapshotBuild(plan));
    }

    console.log(
      JSON.stringify(
        {
          refreshSteps,
          hkDataset: summarizeDataset(hkDataset),
          cryptoDataset: summarizeDataset(cryptoDataset),
          snapshotCount: summaries.length,
          summaries
        },
        null,
        2
      )
    );
  } finally {
    await releaseDailyRefreshLock();
  }
}

function summarizeDataset(dataset: DatasetCatalogRow) {
  return {
    id: dataset.id,
    name: dataset.name,
    market: dataset.market,
    catalogPriceRowCount: dataset.catalogPriceRowCount.toString(),
    catalogMaxTradeDate: dataset.catalogMaxTradeDate
  };
}

function requireCatalogMaxTradeDate(dataset: DatasetCatalogRow, label: string): string {
  if (!dataset.catalogMaxTradeDate) {
    throw new Error(`${label} (${dataset.id}) does not have catalogMaxTradeDate yet.`);
  }

  return dataset.catalogMaxTradeDate;
}

async function ensureHongKongDatasetReady(): Promise<DatasetCatalogRow> {
  const current = await findFirstUsableDataset([HK_REAL_DATASET_ID, HK_DEMO_DATASET_ID]);
  const universeReady = await hasUniverse(HK_UNIVERSE_ID);

  if (current && universeReady) {
    console.log(
      `Hong Kong dataset ready: ${current.id} ` +
        `(${current.catalogPriceRowCount.toString()} rows, asOf=${current.catalogMaxTradeDate ?? 'n/a'}).`
    );
    return current;
  }

  await ensureHongKongSeedPrerequisites();

  const seeded = await findFirstUsableDataset([HK_REAL_DATASET_ID, HK_DEMO_DATASET_ID]);
  if (!seeded || !(await hasUniverse(HK_UNIVERSE_ID))) {
    throw new Error(
      'Hong Kong daily refresh finished but the HK dataset or hk_all_common_equity universe is still unavailable.'
    );
  }

  return seeded;
}

async function ensureHongKongSeedPrerequisites(): Promise<void> {
  const current = await findFirstUsableDataset([HK_REAL_DATASET_ID, HK_DEMO_DATASET_ID]);
  const universeReady = await hasUniverse(HK_UNIVERSE_ID);

  if (current && universeReady) {
    return;
  }

  console.log('Hong Kong seed prerequisites are missing. Running prisma/seed.ts.');
  await runPrismaScript('prisma/seed.ts');
}

async function ensureCryptoDatasetReady(): Promise<DatasetCatalogRow> {
  const current = await getUsableDataset(CRYPTO_DATASET_ID);
  const universeReady = await hasUniverse(CRYPTO_UNIVERSE_ID);

  if (current && universeReady) {
    console.log(
      `Crypto dataset ready: ${current.id} ` +
        `(${current.catalogPriceRowCount.toString()} rows, asOf=${current.catalogMaxTradeDate ?? 'n/a'}).`
    );
    return current;
  }

  console.log('Crypto dataset or universe is missing after daily refresh. Running prisma/import-crypto-market-map.ts.');
  await runPrismaScript('prisma/import-crypto-market-map.ts', [], {
    CRYPTO_MARKET_MAP_SKIP_VERIFICATION_BUILD: '1',
    RISK_ATLAS_IMPORT_EOD_MODE: 'merge'
  });

  const imported = await getUsableDataset(CRYPTO_DATASET_ID);
  if (!imported || !(await hasUniverse(CRYPTO_UNIVERSE_ID))) {
    throw new Error(
      'Crypto daily refresh finished but crypto_market_map_yahoo_v2 or crypto_market_map_all is still unavailable.'
    );
  }

  return imported;
}

async function findFirstUsableDataset(datasetIds: string[]): Promise<DatasetCatalogRow | null> {
  for (const datasetId of datasetIds) {
    const dataset = await getUsableDataset(datasetId);
    if (dataset) {
      return dataset;
    }
  }

  return null;
}

async function getUsableDataset(datasetId: string): Promise<DatasetCatalogRow | null> {
  const dataset = await prisma.dataset.findUnique({
    where: { id: datasetId },
    select: {
      id: true,
      name: true,
      market: true,
      catalogPriceRowCount: true,
      catalogMaxTradeDate: true
    }
  });

  if (!dataset) {
    return null;
  }

  if (dataset.catalogPriceRowCount <= 0n || !dataset.catalogMaxTradeDate) {
    return null;
  }

  return dataset;
}

async function hasUniverse(universeId: string): Promise<boolean> {
  const universe = await prisma.universe.findUnique({
    where: { id: universeId },
    select: { id: true }
  });

  return Boolean(universe);
}

async function ensureSnapshotBuild(plan: SnapshotPlan): Promise<SnapshotBuildSummary> {
  const existingSucceeded = await prisma.buildRun.findFirst({
    where: {
      datasetId: plan.datasetId,
      universeId: plan.universeId,
      asOfDate: plan.asOfDate,
      windowDays: plan.windowDays,
      scoreMethod: plan.scoreMethod,
      status: 'succeeded'
    },
    include: {
      artifact: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  if (existingSucceeded?.artifact) {
    console.log(
      `Reusing existing succeeded daily snapshot ${existingSucceeded.id} for ` +
        `${plan.marketLabel} ${plan.scoreMethod}.`
    );

    return {
      ...plan,
      buildRunId: existingSucceeded.id,
      reusedExistingBuild: true
    };
  }

  const universe = await prisma.universe.findUnique({
    where: { id: plan.universeId },
    select: {
      id: true,
      market: true,
      definitionKind: true,
      symbolsJson: true,
      definitionParams: true
    }
  });

  if (!universe) {
    throw new Error(`Universe "${plan.universeId}" was not found for daily refresh.`);
  }

  await validateBuildRequestCoverage({
    datasetId: plan.datasetId,
    universe: universe as UniverseValidationRow,
    asOfDate: plan.asOfDate,
    windowDays: plan.windowDays
  });

  const buildRun = await prisma.buildRun.create({
    data: {
      datasetId: plan.datasetId,
      universeId: plan.universeId,
      asOfDate: plan.asOfDate,
      windowDays: plan.windowDays,
      scoreMethod: plan.scoreMethod
    }
  });

  await runBuild(buildRun.id);

  const completed = await prisma.buildRun.findUnique({
    where: { id: buildRun.id },
    include: { artifact: true }
  });

  if (!completed || completed.status !== 'succeeded' || !completed.artifact) {
    throw new Error(
      `Daily snapshot build ${buildRun.id} failed for ${plan.marketLabel} ${plan.scoreMethod}: ` +
        `${completed?.errorMessage ?? 'unknown error'}`
    );
  }

  return {
    ...plan,
    buildRunId: completed.id,
    reusedExistingBuild: false
  };
}

async function tryAcquireDailyRefreshLock(): Promise<boolean> {
  const [row] = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(${DAILY_REFRESH_LOCK_KEY_1}, ${DAILY_REFRESH_LOCK_KEY_2}) AS locked
  `;

  return Boolean(row?.locked);
}

async function releaseDailyRefreshLock(): Promise<void> {
  await prisma.$executeRaw`
    SELECT pg_advisory_unlock(${DAILY_REFRESH_LOCK_KEY_1}, ${DAILY_REFRESH_LOCK_KEY_2})
  `;
}

async function runPrismaScript(
  scriptPath: string,
  scriptArgs: string[] = [],
  extraEnv: Record<string, string> = {}
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', scriptPath, ...scriptArgs], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...extraEnv
      },
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${scriptPath} exited with ${
            signal ? `signal ${signal}` : `code ${String(code ?? 'unknown')}`
          }.`
        )
      );
    });
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main()
    .catch((error) => {
      console.error('Daily market refresh failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await disconnectPrisma();
    });
}