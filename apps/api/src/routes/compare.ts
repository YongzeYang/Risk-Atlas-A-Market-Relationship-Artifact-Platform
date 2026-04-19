import type { FastifyPluginAsync } from 'fastify';

import {
  compareBuildStructuresResponseSchema,
  compareBuildsQuerystringSchema,
  type CompareBuildsQuerystring,
  type CompareBuildsResponse,
  type CompareDriftEntry
} from '../contracts/build-runs.js';
import { ServiceError } from '../lib/service-error.js';
import { loadSucceededBuildRunArtifactContext } from '../services/build-run-artifact-context.js';
import { queryBsmCompareTopDrift } from '../services/bsm-reader.js';
import { compareBuildStructures } from '../services/structure-service.js';

export const compareRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: CompareBuildsQuerystring }>(
    '/compare-builds',
    {
      schema: {
        tags: ['compare'],
        summary: 'Compare two build runs by their top drift pairs',
        querystring: compareBuildsQuerystringSchema
      }
    },
    async (request, reply) => {
      try {
        const result = await compareBuilds(request.query.leftId, request.query.rightId);
        return result;
      } catch (error) {
        if (error instanceof ServiceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  app.get<{ Querystring: CompareBuildsQuerystring }>(
    '/compare-build-structures',
    {
      schema: {
        tags: ['compare'],
        summary: 'Compare clustered structure drift between two build runs',
        querystring: compareBuildsQuerystringSchema,
        response: {
          200: compareBuildStructuresResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        return await compareBuildStructures(request.query.leftId, request.query.rightId);
      } catch (error) {
        if (error instanceof ServiceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        throw error;
      }
    }
  );
};

async function compareBuilds(
  leftId: string,
  rightId: string
): Promise<CompareBuildsResponse> {
  const [leftContext, rightContext] = await Promise.all([
    loadSucceededBuildRunArtifactContext(
      leftId,
      `Build run "${leftId}" is not ready for comparison.`
    ),
    loadSucceededBuildRunArtifactContext(
      rightId,
      `Build run "${rightId}" is not ready for comparison.`
    )
  ]);

  // Find common symbols
  const rightSymbolSet = new Set(rightContext.preview.symbolOrder);
  const commonSymbols = leftContext.preview.symbolOrder
    .filter((symbol) => rightSymbolSet.has(symbol))
    .sort();

  if (commonSymbols.length < 2) {
    throw new ServiceError(400, 'Fewer than 2 common symbols between builds.');
  }

  // Build index maps
  const leftIndices = commonSymbols.map((symbol) => {
    const index = leftContext.symbolIndexBySymbol.get(symbol);
    if (index === undefined) {
      throw new Error(`Missing left-side symbol index for "${symbol}".`);
    }

    return index;
  });
  const rightIndices = commonSymbols.map((symbol) => {
    const index = rightContext.symbolIndexBySymbol.get(symbol);
    if (index === undefined) {
      throw new Error(`Missing right-side symbol index for "${symbol}".`);
    }

    return index;
  });

  const driftPairs: CompareDriftEntry[] = (
    await queryBsmCompareTopDrift({
      leftBsmPath: leftContext.matrixPath,
      rightBsmPath: rightContext.matrixPath,
      leftIndices,
      rightIndices,
      limit: 50
    })
  ).map((entry) => ({
    left: commonSymbols[entry.leftPos]!,
    right: commonSymbols[entry.rightPos]!,
    leftScore: entry.leftScore,
    rightScore: entry.rightScore,
    delta: entry.delta
  }));

  return {
    left: {
      id: leftId,
      asOfDate: leftContext.asOfDate,
      symbolCount: leftContext.preview.symbolOrder.length
    },
    right: {
      id: rightId,
      asOfDate: rightContext.asOfDate,
      symbolCount: rightContext.preview.symbolOrder.length
    },
    commonSymbols,
    topDriftPairs: driftPairs
  };
}
