import { prisma } from '../lib/prisma.js';
import { ServiceError } from '../lib/service-error.js';
import {
  isBuildRunScoreMethod,
  isBuildRunWindowDays,
  type BuildSeriesDetailResponse,
  type BuildSeriesFrequency,
  type BuildSeriesListItem,
  type BuildSeriesRunItem,
  type BuildSeriesStatus,
  type BuildRunScoreMethod,
  type BuildRunStatus,
  type BuildRunWindowDays,
  type CreateBuildSeriesRequestBody
} from '../contracts/build-runs.js';
import { validateBuildRequestCoverage } from './build-request-validation-service.js';
import { validateInviteCode } from './invite-code-service.js';
import { scheduleBuildRun } from './build-run-runner.js';

export async function createBuildSeries(
  input: CreateBuildSeriesRequestBody
): Promise<BuildSeriesListItem> {
  if (!input.inviteCode) {
    throw new ServiceError(403, 'Invite code is required.');
  }
  const validInvite = await validateInviteCode(input.inviteCode);
  if (!validInvite) {
    throw new ServiceError(403, 'Invalid invite code.');
  }

  if (!isBuildRunWindowDays(input.windowDays)) {
    throw new ServiceError(400, `Unsupported windowDays "${input.windowDays}".`);
  }

  if (!isBuildRunScoreMethod(input.scoreMethod)) {
    throw new ServiceError(400, `Unsupported scoreMethod "${input.scoreMethod}".`);
  }

  const [dataset, universe] = await Promise.all([
    prisma.dataset.findUnique({
      where: { id: input.datasetId },
      select: { id: true, market: true }
    }),
    prisma.universe.findUnique({
      where: { id: input.universeId },
      select: {
        id: true,
        market: true,
        definitionKind: true,
        symbolsJson: true,
        definitionParams: true
      }
    })
  ]);

  if (!dataset) throw new ServiceError(404, `Dataset "${input.datasetId}" not found.`);
  if (!universe) throw new ServiceError(404, `Universe "${input.universeId}" not found.`);

  if (dataset.market !== universe.market) {
    throw new ServiceError(
      400,
      `Dataset "${dataset.id}" and universe "${universe.id}" must belong to the same market.`
    );
  }

  if (input.startDate >= input.endDate) {
    throw new ServiceError(400, 'startDate must be before endDate.');
  }

  const asOfDates = generateSeriesDates(input.startDate, input.endDate, input.frequency);
  if (asOfDates.length === 0) {
    throw new ServiceError(400, 'No build dates in the given range.');
  }

  const boundaryDates = new Set<string>([
    asOfDates[0]!,
    asOfDates[asOfDates.length - 1]!
  ]);

  for (const asOfDate of boundaryDates) {
    await validateBuildRequestCoverage({
      datasetId: input.datasetId,
      universe,
      asOfDate,
      windowDays: input.windowDays
    });
  }

  const series = await prisma.buildSeries.create({
    data: {
      name: input.name,
      datasetId: input.datasetId,
      universeId: input.universeId,
      windowDays: input.windowDays,
      scoreMethod: input.scoreMethod,
      startDate: input.startDate,
      endDate: input.endDate,
      frequency: input.frequency,
      totalRunCount: asOfDates.length
    }
  });

  // Create individual build runs for each date
  const buildRuns = await Promise.all(
    asOfDates.map((asOfDate) =>
      prisma.buildRun.create({
        data: {
          datasetId: input.datasetId,
          universeId: input.universeId,
          seriesId: series.id,
          asOfDate,
          windowDays: input.windowDays,
          scoreMethod: input.scoreMethod
        }
      })
    )
  );

  // Schedule all builds
  for (const run of buildRuns) {
    scheduleBuildRun(run.id);
  }

  // Update series status to running
  await prisma.buildSeries.update({
    where: { id: series.id },
    data: { status: 'running', startedAt: new Date() }
  });

  return mapBuildSeriesListItem(series);
}

export async function listBuildSeries(): Promise<BuildSeriesListItem[]> {
  const seriesList = await prisma.buildSeries.findMany({
    orderBy: { createdAt: 'desc' }
  });
  return seriesList.map(mapBuildSeriesListItem);
}

export async function getBuildSeriesDetail(id: string): Promise<BuildSeriesDetailResponse | null> {
  const series = await prisma.buildSeries.findUnique({
    where: { id },
    include: {
      buildRuns: {
        orderBy: { asOfDate: 'asc' },
        select: {
          id: true,
          asOfDate: true,
          status: true,
          createdAt: true,
          startedAt: true,
          finishedAt: true,
          errorMessage: true
        }
      }
    }
  });
  if (!series) return null;

  const runs: BuildSeriesRunItem[] = series.buildRuns.map(r => ({
    id: r.id,
    asOfDate: r.asOfDate,
    status: r.status as BuildRunStatus,
    createdAt: r.createdAt.toISOString(),
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
    errorMessage: r.errorMessage
  }));

  return {
    ...mapBuildSeriesListItem(series),
    runs
  };
}

function generateSeriesDates(
  startDate: string,
  endDate: string,
  frequency: string
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  const current = new Date(start);
  while (current <= end) {
    // Skip weekends
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const dateStr = current.toISOString().split('T')[0]!;

      if (frequency === 'daily') {
        dates.push(dateStr);
      } else if (frequency === 'weekly' && dayOfWeek === 5) {
        // Fridays only for weekly
        dates.push(dateStr);
      } else if (frequency === 'monthly' && isLastBusinessDayOfMonth(current)) {
        dates.push(dateStr);
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function isLastBusinessDayOfMonth(date: Date): boolean {
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
    nextDay.setDate(nextDay.getDate() + 1);
  }
  return nextDay.getMonth() !== date.getMonth();
}

type BuildSeriesRow = {
  id: string;
  name: string;
  datasetId: string;
  universeId: string;
  windowDays: number;
  scoreMethod: string;
  startDate: string;
  endDate: string;
  frequency: string;
  status: string;
  totalRunCount: number;
  completedRunCount: number;
  failedRunCount: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

function mapBuildSeriesListItem(series: BuildSeriesRow): BuildSeriesListItem {
  return {
    id: series.id,
    name: series.name,
    datasetId: series.datasetId,
    universeId: series.universeId,
    windowDays: series.windowDays as BuildRunWindowDays,
    scoreMethod: series.scoreMethod as BuildRunScoreMethod,
    startDate: series.startDate,
    endDate: series.endDate,
    frequency: series.frequency as BuildSeriesFrequency,
    status: series.status as BuildSeriesStatus,
    totalRunCount: series.totalRunCount,
    completedRunCount: series.completedRunCount,
    failedRunCount: series.failedRunCount,
    createdAt: series.createdAt.toISOString(),
    startedAt: series.startedAt?.toISOString() ?? null,
    finishedAt: series.finishedAt?.toISOString() ?? null
  };
}
