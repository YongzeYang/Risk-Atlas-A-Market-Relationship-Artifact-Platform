import { prisma } from '../lib/prisma.js';
import { ServiceError } from '../lib/service-error.js';
import { parseUniverseSymbolsJson } from '../lib/universe-symbols.js';
import {
  MATRIX_ARTIFACT_MEDIA_TYPE,
  isBuildRunScoreMethod,
  isBuildRunWindowDays,
  type ArtifactDownloadInfo,
  type ArtifactStorageKind,
  type ArtifactSummary,
  type BuildRunDetailResponse,
  type BuildRunIdParams,
  type BuildRunListItem,
  type BuildRunScoreMethod,
  type BuildRunStatus,
  type BuildRunWindowDays,
  type CreateBuildRunRequestBody,
  type TopPairItem
} from '../contracts/build-runs.js';
import { readPreviewArtifact } from './local-artifact-store.js';

type BuildRunRow = {
  id: string;
  datasetId: string;
  universeId: string;
  asOfDate: string;
  windowDays: number;
  scoreMethod: string;
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorMessage: string | null;
};

type ArtifactRow = {
  id: string;
  bundleVersion: number;
  storageKind: string;
  storageBucket: string | null;
  storagePrefix: string;
  symbolCount: number;
  minScore: number | null;
  maxScore: number | null;
  matrixByteSize: bigint | null;
  previewByteSize: bigint | null;
  manifestByteSize: bigint | null;
};

export type BuildRunDownloadDescriptor = {
  storageKind: ArtifactStorageKind;
  storagePrefix: string;
  filename: string;
  mediaType: typeof MATRIX_ARTIFACT_MEDIA_TYPE;
};

export async function createBuildRun(
  input: CreateBuildRunRequestBody
): Promise<BuildRunListItem> {
  if (!isBuildRunWindowDays(input.windowDays)) {
    throw new ServiceError(400, `Unsupported windowDays "${input.windowDays}".`);
  }

  if (!isBuildRunScoreMethod(input.scoreMethod)) {
    throw new ServiceError(400, `Unsupported scoreMethod "${input.scoreMethod}".`);
  }

  const [dataset, universe] = await Promise.all([
    prisma.dataset.findUnique({
      where: {
        id: input.datasetId
      },
      select: {
        id: true,
        market: true
      }
    }),
    prisma.universe.findUnique({
      where: {
        id: input.universeId
      },
      select: {
        id: true,
        market: true,
        symbolsJson: true
      }
    })
  ]);

  if (!dataset) {
    throw new ServiceError(404, `Dataset "${input.datasetId}" was not found.`);
  }

  if (!universe) {
    throw new ServiceError(404, `Universe "${input.universeId}" was not found.`);
  }

  if (dataset.market !== universe.market) {
    throw new ServiceError(
      400,
      `Dataset "${dataset.id}" and universe "${universe.id}" must belong to the same market.`
    );
  }

  parseUniverseSymbolsJson(universe.symbolsJson);

  const buildRun = await prisma.buildRun.create({
    data: {
      datasetId: input.datasetId,
      universeId: input.universeId,
      asOfDate: input.asOfDate,
      windowDays: input.windowDays,
      scoreMethod: input.scoreMethod
    }
  });

  return mapBuildRunListItem(buildRun);
}

export async function listBuildRuns(): Promise<BuildRunListItem[]> {
  const buildRuns = await prisma.buildRun.findMany({
    orderBy: [
      {
        createdAt: 'desc'
      }
    ]
  });

  return buildRuns.map(mapBuildRunListItem);
}

export async function getBuildRunDetail(
  id: BuildRunIdParams['id']
): Promise<BuildRunDetailResponse | null> {
  const buildRun = await prisma.buildRun.findUnique({
    where: {
      id
    },
    include: {
      artifact: true
    }
  });

  if (!buildRun) {
    return null;
  }

  const base = mapBuildRunListItem(buildRun);

  let symbolOrder: string[] = [];
  let topPairs: TopPairItem[] = [];
  let artifact: ArtifactSummary | null = null;
  let artifactDownload: ArtifactDownloadInfo | null = null;
  let symbolCount: number | null = null;
  let minScore: number | null = null;
  let maxScore: number | null = null;

  if (buildRun.artifact) {
    artifact = mapArtifactSummary(buildRun.artifact);
    symbolCount = artifact.symbolCount;
    minScore = artifact.minScore;
    maxScore = artifact.maxScore;
  }

  if (buildRun.status === 'succeeded' && buildRun.artifact) {
    const preview = await readPreviewArtifact(
      buildRun.artifact.storageKind,
      buildRun.artifact.storagePrefix
    );

    if (artifact && artifact.symbolCount !== preview.symbolOrder.length) {
      throw new Error(
        `Artifact symbolCount mismatch for build "${buildRun.id}": ` +
          `metadata=${artifact.symbolCount}, preview=${preview.symbolOrder.length}.`
      );
    }

    symbolOrder = preview.symbolOrder;
    topPairs = preview.topPairs;
    artifactDownload = makeArtifactDownloadInfo(buildRun.id);

    if (symbolCount === null) {
      symbolCount = preview.symbolOrder.length;
    }

    if (minScore === null) {
      minScore = preview.minScore;
    }

    if (maxScore === null) {
      maxScore = preview.maxScore;
    }
  }

  return {
    ...base,
    durationMs: computeDurationMs(buildRun.startedAt, buildRun.finishedAt),
    symbolCount,
    minScore,
    maxScore,
    artifact,
    artifactDownload,
    symbolOrder,
    topPairs
  };
}

export async function getBuildRunDownloadArtifact(
  id: BuildRunIdParams['id']
): Promise<BuildRunDownloadDescriptor> {
  const buildRun = await prisma.buildRun.findUnique({
    where: {
      id
    },
    include: {
      artifact: true
    }
  });

  if (!buildRun) {
    throw new ServiceError(404, `Build run "${id}" was not found.`);
  }

  if (buildRun.status !== 'succeeded' || !buildRun.artifact) {
    throw new ServiceError(409, `Build run "${id}" is not ready for artifact download.`);
  }

  const downloadInfo = makeArtifactDownloadInfo(buildRun.id);

  return {
    storageKind: buildRun.artifact.storageKind as ArtifactStorageKind,
    storagePrefix: buildRun.artifact.storagePrefix,
    filename: downloadInfo.filename,
    mediaType: downloadInfo.mediaType
  };
}

function mapBuildRunListItem(buildRun: BuildRunRow): BuildRunListItem {
  return {
    id: buildRun.id,
    datasetId: buildRun.datasetId,
    universeId: buildRun.universeId,
    asOfDate: buildRun.asOfDate,
    windowDays: buildRun.windowDays as BuildRunWindowDays,
    scoreMethod: buildRun.scoreMethod as BuildRunScoreMethod,
    status: buildRun.status as BuildRunStatus,
    createdAt: buildRun.createdAt.toISOString(),
    startedAt: buildRun.startedAt?.toISOString() ?? null,
    finishedAt: buildRun.finishedAt?.toISOString() ?? null,
    errorMessage: buildRun.errorMessage
  };
}

function mapArtifactSummary(artifact: ArtifactRow): ArtifactSummary {
  return {
    id: artifact.id,
    bundleVersion: artifact.bundleVersion,
    storageKind: artifact.storageKind as ArtifactStorageKind,
    storageBucket: artifact.storageBucket,
    storagePrefix: artifact.storagePrefix,
    symbolCount: artifact.symbolCount,
    minScore: artifact.minScore,
    maxScore: artifact.maxScore,
    matrixByteSize: bigIntToSafeInteger(artifact.matrixByteSize),
    previewByteSize: bigIntToSafeInteger(artifact.previewByteSize),
    manifestByteSize: bigIntToSafeInteger(artifact.manifestByteSize)
  };
}

function bigIntToSafeInteger(value: bigint | null): number | null {
  if (value === null) {
    return null;
  }

  const asNumber = Number(value);

  if (!Number.isSafeInteger(asNumber)) {
    throw new Error(`Artifact byte size ${value.toString()} exceeds JS safe integer range.`);
  }

  return asNumber;
}

function computeDurationMs(startedAt: Date | null, finishedAt: Date | null): number | null {
  if (!startedAt || !finishedAt) {
    return null;
  }

  return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

function makeArtifactDownloadInfo(buildRunId: string): ArtifactDownloadInfo {
  return {
    url: `/build-runs/${buildRunId}/download`,
    filename: `risk-atlas-${buildRunId}.bsm`,
    mediaType: MATRIX_ARTIFACT_MEDIA_TYPE
  };
}