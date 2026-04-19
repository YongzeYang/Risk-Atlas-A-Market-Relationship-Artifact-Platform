import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { ServiceError } from '../lib/service-error.js';
import {
  MAX_BUILD_UNIVERSE_SIZE,
  MIN_BUILD_UNIVERSE_SIZE,
  type BuildRequestValidationReasonCode,
  type BuildRequestValidationResponse,
  type BuildRunWindowDays
} from '../contracts/build-runs.js';
import { prepareCorrelationInputs } from './correlation-preparation-service.js';
import { resolveUniverseSymbols } from './universe-resolver.js';

type UniverseValidationRow = {
  id: string;
  market?: string;
  definitionKind: string;
  symbolsJson: Prisma.JsonValue;
  definitionParams: Prisma.JsonValue;
};

type DatasetValidationRow = {
  id: string;
  market: string;
};

type InsufficientSymbol = {
  symbol: string;
  rowCount: number;
};

type BuildRequestCoverageAssessment = {
  coverageQualifiedSymbols: string[];
  matrixReadySymbols: string[];
  requiredRows: number;
  insufficientSymbols: InsufficientSymbol[];
  filteredOutSymbols: string[];
  matrixPreparationError: string | null;
};

export async function getBuildRequestValidation(args: {
  datasetId: string;
  universeId: string;
  asOfDate: string;
  windowDays: BuildRunWindowDays;
}): Promise<BuildRequestValidationResponse> {
  const [dataset, universe] = await Promise.all([
    prisma.dataset.findUnique({
      where: { id: args.datasetId },
      select: { id: true, market: true }
    }),
    prisma.universe.findUnique({
      where: { id: args.universeId },
      select: {
        id: true,
        market: true,
        definitionKind: true,
        symbolsJson: true,
        definitionParams: true
      }
    })
  ]);

  if (!dataset) {
    return makeInvalidValidationResponse({
      ...args,
      reasonCode: 'dataset_not_found',
      message: `Dataset "${args.datasetId}" was not found.`
    });
  }

  if (!universe) {
    return makeInvalidValidationResponse({
      ...args,
      reasonCode: 'universe_not_found',
      message: `Universe "${args.universeId}" was not found.`
    });
  }

  if (dataset.market !== universe.market) {
    return makeInvalidValidationResponse({
      ...args,
      reasonCode: 'market_mismatch',
      message:
        `Dataset "${dataset.id}" and universe "${universe.id}" must belong to the same market.`
    });
  }

  return getBuildRequestValidationForResolvedUniverse({
    dataset,
    universe,
    asOfDate: args.asOfDate,
    windowDays: args.windowDays
  });
}

export async function getBuildRequestValidationForResolvedUniverse(args: {
  dataset: DatasetValidationRow;
  universe: UniverseValidationRow;
  asOfDate: string;
  windowDays: BuildRunWindowDays;
}): Promise<BuildRequestValidationResponse> {
  const assessment = await assessBuildRequestCoverage({
    datasetId: args.dataset.id,
    universe: args.universe,
    asOfDate: args.asOfDate,
    windowDays: args.windowDays
  });

  if (assessment.insufficientSymbols.length > 0) {
    const preview = assessment.insufficientSymbols
      .slice(0, 5)
      .map((entry) => `${entry.symbol}(${entry.rowCount})`)
      .join(', ');

    return makeInvalidValidationResponse({
      datasetId: args.dataset.id,
      universeId: args.universe.id,
      asOfDate: args.asOfDate,
      windowDays: args.windowDays,
      reasonCode: 'insufficient_history',
      message:
        `Dataset "${args.dataset.id}" does not have enough history for universe "${args.universe.id}" at ${args.asOfDate}. ` +
        `Need ${assessment.requiredRows} rows per symbol. First insufficient symbols: ${preview}.`,
      requiredRows: assessment.requiredRows
    });
  }

  if (assessment.matrixPreparationError) {
    return makeInvalidValidationResponse({
      datasetId: args.dataset.id,
      universeId: args.universe.id,
      asOfDate: args.asOfDate,
      windowDays: args.windowDays,
      reasonCode: 'insufficient_history',
      message:
        `Dataset "${args.dataset.id}" does not provide enough usable trading history for universe "${args.universe.id}" at ${args.asOfDate}. ` +
        assessment.matrixPreparationError,
      requiredRows: assessment.requiredRows
    });
  }

  if (
    assessment.matrixReadySymbols.length < MIN_BUILD_UNIVERSE_SIZE ||
    assessment.matrixReadySymbols.length > MAX_BUILD_UNIVERSE_SIZE
  ) {
    const filteredOutCount = assessment.filteredOutSymbols.length;
    const coverageQualifiedCount = assessment.coverageQualifiedSymbols.length;

    return makeInvalidValidationResponse({
      datasetId: args.dataset.id,
      universeId: args.universe.id,
      asOfDate: args.asOfDate,
      windowDays: args.windowDays,
      reasonCode: 'universe_size',
      message:
        `Universe symbol count must be between ${MIN_BUILD_UNIVERSE_SIZE} and ${MAX_BUILD_UNIVERSE_SIZE}. ` +
        `Resolved ${assessment.matrixReadySymbols.length} matrix-ready symbols for this selection.` +
        (filteredOutCount > 0
          ? ` ${coverageQualifiedCount} coverage-qualified symbols were available before filtering ${filteredOutCount} flat or unusable return series.`
          : ''),
      resolvedSymbolCount: assessment.matrixReadySymbols.length,
      requiredRows: assessment.requiredRows
    });
  }

  return {
    valid: true,
    reasonCode: 'ok',
    message: null,
    datasetId: args.dataset.id,
    universeId: args.universe.id,
    asOfDate: args.asOfDate,
    windowDays: args.windowDays,
    resolvedSymbolCount: assessment.matrixReadySymbols.length,
    requiredRows: assessment.requiredRows
  };
}

export async function assessBuildRequestCoverage(args: {
  datasetId: string;
  universe: UniverseValidationRow;
  asOfDate: string;
  windowDays: BuildRunWindowDays;
}): Promise<BuildRequestCoverageAssessment> {
  const requiredRows = args.windowDays + 1;
  const resolvedSymbols = await resolveUniverseSymbols(args.universe, args.datasetId, args.asOfDate, {
    minimumRows: requiredRows
  });

  if (resolvedSymbols.length === 0) {
    return {
      coverageQualifiedSymbols: [],
      matrixReadySymbols: [],
      requiredRows,
      insufficientSymbols: [],
      filteredOutSymbols: [],
      matrixPreparationError: null
    };
  }

  const grouped = await prisma.eodPrice.groupBy({
    by: ['symbol'],
    where: {
      datasetId: args.datasetId,
      symbol: {
        in: resolvedSymbols
      },
      tradeDate: {
        lte: args.asOfDate
      }
    },
    _count: {
      _all: true
    }
  });

  const countsBySymbol = new Map(grouped.map((entry) => [entry.symbol, entry._count._all] as const));
  const insufficientSymbols = resolvedSymbols
    .map((symbol) => ({
      symbol,
      rowCount: countsBySymbol.get(symbol) ?? 0
    }))
    .filter((entry) => entry.rowCount < requiredRows);

  const coverageQualifiedSymbols = resolvedSymbols.filter(
    (symbol) => (countsBySymbol.get(symbol) ?? 0) >= requiredRows
  );

  if (insufficientSymbols.length > 0 || coverageQualifiedSymbols.length === 0) {
    return {
      coverageQualifiedSymbols,
      matrixReadySymbols: [],
      requiredRows,
      insufficientSymbols,
      filteredOutSymbols: [],
      matrixPreparationError: null
    };
  }

  try {
    const preparedInputs = await prepareCorrelationInputs({
      datasetId: args.datasetId,
      symbolOrder: coverageQualifiedSymbols,
      asOfDate: args.asOfDate,
      windowDays: args.windowDays
    });

    return {
      coverageQualifiedSymbols,
      matrixReadySymbols: preparedInputs.matrixReadySymbolOrder,
      requiredRows,
      insufficientSymbols,
      filteredOutSymbols: preparedInputs.filteredOutSymbols,
      matrixPreparationError: null
    };
  } catch (error) {
    return {
      coverageQualifiedSymbols,
      matrixReadySymbols: [],
      requiredRows,
      insufficientSymbols,
      filteredOutSymbols: [],
      matrixPreparationError: toAssessmentErrorMessage(error)
    };
  }
}

export async function validateBuildRequestCoverage(args: {
  datasetId: string;
  universe: UniverseValidationRow;
  asOfDate: string;
  windowDays: BuildRunWindowDays;
}): Promise<string[]> {
  const assessment = await assessBuildRequestCoverage(args);

  if (assessment.insufficientSymbols.length > 0) {
    const preview = assessment.insufficientSymbols
      .slice(0, 5)
      .map((entry) => `${entry.symbol}(${entry.rowCount})`)
      .join(', ');

    throw new ServiceError(
      400,
      `Dataset "${args.datasetId}" does not have enough history for universe "${args.universe.id}" at ${args.asOfDate}. ` +
        `Need ${assessment.requiredRows} rows per symbol. First insufficient symbols: ${preview}.`
    );
  }

  if (assessment.matrixPreparationError) {
    throw new ServiceError(
      400,
      `Dataset "${args.datasetId}" does not provide enough usable trading history for universe "${args.universe.id}" at ${args.asOfDate}. ` +
        assessment.matrixPreparationError
    );
  }

  if (
    assessment.matrixReadySymbols.length < MIN_BUILD_UNIVERSE_SIZE ||
    assessment.matrixReadySymbols.length > MAX_BUILD_UNIVERSE_SIZE
  ) {
    const filteredOutCount = assessment.filteredOutSymbols.length;
    const coverageQualifiedCount = assessment.coverageQualifiedSymbols.length;

    throw new ServiceError(
      400,
      `Universe symbol count must be between ${MIN_BUILD_UNIVERSE_SIZE} and ${MAX_BUILD_UNIVERSE_SIZE}. ` +
        `Resolved ${assessment.matrixReadySymbols.length} matrix-ready symbols for this selection.` +
        (filteredOutCount > 0
          ? ` ${coverageQualifiedCount} coverage-qualified symbols were available before filtering ${filteredOutCount} flat or unusable return series.`
          : '')
    );
  }

  return assessment.matrixReadySymbols;
}

function toAssessmentErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown build-preparation failure.';
}

function makeInvalidValidationResponse(args: {
  datasetId: string;
  universeId: string;
  asOfDate: string;
  windowDays: BuildRunWindowDays;
  reasonCode: Exclude<BuildRequestValidationReasonCode, 'ok'>;
  message: string;
  resolvedSymbolCount?: number | null;
  requiredRows?: number;
}): BuildRequestValidationResponse {
  return {
    valid: false,
    reasonCode: args.reasonCode,
    message: args.message,
    datasetId: args.datasetId,
    universeId: args.universeId,
    asOfDate: args.asOfDate,
    windowDays: args.windowDays,
    resolvedSymbolCount: args.resolvedSymbolCount ?? null,
    requiredRows: args.requiredRows ?? args.windowDays + 1
  };
}