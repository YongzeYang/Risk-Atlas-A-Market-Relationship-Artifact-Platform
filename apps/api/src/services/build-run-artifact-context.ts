import { prisma } from '../lib/prisma.js';
import { ServiceError } from '../lib/service-error.js';
import {
  ARTIFACT_FILE_NAMES,
  type BuildRunScoreMethod,
  type BuildRunWindowDays,
  type PreviewV1
} from '../contracts/build-runs.js';
import {
  readPreviewArtifact,
  resolveLocalStorageFilePath
} from './local-artifact-store.js';

export type LoadedBuildRunArtifactContext = {
  buildRunId: string;
  datasetId: string;
  asOfDate: string;
  windowDays: BuildRunWindowDays;
  scoreMethod: BuildRunScoreMethod;
  preview: PreviewV1;
  symbolIndexBySymbol: Map<string, number>;
  matrixPath: string;
};

export async function loadSucceededBuildRunArtifactContext(
  buildRunId: string,
  notReadyMessage = `Build run "${buildRunId}" is not ready for artifact queries.`
): Promise<LoadedBuildRunArtifactContext> {
  const buildRun = await prisma.buildRun.findUnique({
    where: {
      id: buildRunId
    },
    select: {
      id: true,
      datasetId: true,
      asOfDate: true,
      windowDays: true,
      scoreMethod: true,
      status: true,
      artifact: {
        select: {
          storageKind: true,
          storagePrefix: true
        }
      }
    }
  });

  if (!buildRun) {
    throw new ServiceError(404, `Build run "${buildRunId}" was not found.`);
  }

  if (buildRun.status !== 'succeeded' || !buildRun.artifact) {
    throw new ServiceError(409, notReadyMessage);
  }

  const preview = await readPreviewArtifact(
    buildRun.artifact.storageKind,
    buildRun.artifact.storagePrefix
  );

  if (preview.buildRunId !== buildRunId) {
    throw new Error(
      `Preview buildRunId mismatch: expected "${buildRunId}", got "${preview.buildRunId}".`
    );
  }

  if (buildRun.artifact.storageKind !== 'local_fs') {
    throw new Error(
      `BSM artifact queries are not implemented for storageKind "${buildRun.artifact.storageKind}".`
    );
  }

  const symbolIndexBySymbol = new Map(
    preview.symbolOrder.map((symbol, index) => [symbol, index] as const)
  );

  return {
    buildRunId,
    datasetId: buildRun.datasetId,
    asOfDate: buildRun.asOfDate,
    windowDays: buildRun.windowDays as BuildRunWindowDays,
    scoreMethod: buildRun.scoreMethod as BuildRunScoreMethod,
    preview,
    symbolIndexBySymbol,
    matrixPath: resolveLocalStorageFilePath(
      buildRun.artifact.storagePrefix,
      ARTIFACT_FILE_NAMES.matrix
    )
  };
}

export function normalizeArtifactSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function requireArtifactSymbolIndex(
  context: LoadedBuildRunArtifactContext,
  symbol: string
): number {
  const index = context.symbolIndexBySymbol.get(symbol);

  if (index === undefined) {
    throw new ServiceError(
      404,
      `Symbol "${symbol}" was not found in build run "${context.buildRunId}".`
    );
  }

  return index;
}