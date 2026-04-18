import type { FastifyPluginAsync } from 'fastify';

import {
  analysisInviteHeadersSchema,
  compareBuildStructuresResponseSchema,
  compareBuildsQuerystringSchema,
  type CompareBuildsQuerystring,
  type CompareBuildsResponse,
  type CompareDriftEntry
} from '../contracts/build-runs.js';
import { ServiceError } from '../lib/service-error.js';
import { readPreviewArtifact } from '../services/local-artifact-store.js';
import { prisma } from '../lib/prisma.js';
import { requireInviteCodeHeader } from '../services/invite-code-service.js';
import { compareBuildStructures } from '../services/structure-service.js';

export const compareRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: CompareBuildsQuerystring }>(
    '/compare-builds',
    {
      schema: {
        tags: ['compare'],
        summary: 'Compare two build runs by their top drift pairs',
        headers: analysisInviteHeadersSchema,
        querystring: compareBuildsQuerystringSchema
      }
    },
    async (request, reply) => {
      try {
        await requireInviteCodeHeader(request.headers);
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
        headers: analysisInviteHeadersSchema,
        querystring: compareBuildsQuerystringSchema,
        response: {
          200: compareBuildStructuresResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        await requireInviteCodeHeader(request.headers);
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
  const [leftRun, rightRun] = await Promise.all([
    prisma.buildRun.findUnique({
      where: { id: leftId },
      include: { artifact: true }
    }),
    prisma.buildRun.findUnique({
      where: { id: rightId },
      include: { artifact: true }
    })
  ]);

  if (!leftRun) throw new ServiceError(404, `Build run "${leftId}" not found.`);
  if (!rightRun) throw new ServiceError(404, `Build run "${rightId}" not found.`);

  if (leftRun.status !== 'succeeded' || !leftRun.artifact) {
    throw new ServiceError(409, `Build run "${leftId}" is not ready for comparison.`);
  }
  if (rightRun.status !== 'succeeded' || !rightRun.artifact) {
    throw new ServiceError(409, `Build run "${rightId}" is not ready for comparison.`);
  }

  const [leftPreview, rightPreview] = await Promise.all([
    readPreviewArtifact(leftRun.artifact.storageKind, leftRun.artifact.storagePrefix),
    readPreviewArtifact(rightRun.artifact.storageKind, rightRun.artifact.storagePrefix)
  ]);

  // Find common symbols
  const leftSymbolSet = new Set(leftPreview.symbolOrder);
  const rightSymbolSet = new Set(rightPreview.symbolOrder);
  const commonSymbols = leftPreview.symbolOrder.filter((s) => rightSymbolSet.has(s)).sort();

  if (commonSymbols.length < 2) {
    throw new ServiceError(400, 'Fewer than 2 common symbols between builds.');
  }

  // Build index maps
  const leftIndexMap = new Map(leftPreview.symbolOrder.map((s, i) => [s, i]));
  const rightIndexMap = new Map(rightPreview.symbolOrder.map((s, i) => [s, i]));

  // Compute drift for all common symbol pairs
  const driftPairs: CompareDriftEntry[] = [];
  for (let i = 0; i < commonSymbols.length; i++) {
    for (let j = i + 1; j < commonSymbols.length; j++) {
      const left = commonSymbols[i]!;
      const right = commonSymbols[j]!;

      const li = leftIndexMap.get(left)!;
      const lj = leftIndexMap.get(right)!;
      const ri = rightIndexMap.get(left)!;
      const rj = rightIndexMap.get(right)!;

      const leftScore = leftPreview.scores[li]![lj]!;
      const rightScore = rightPreview.scores[ri]![rj]!;
      const delta = rightScore - leftScore;

      driftPairs.push({ left, right, leftScore, rightScore, delta });
    }
  }

  // Sort by absolute delta descending
  driftPairs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    left: {
      id: leftId,
      asOfDate: leftRun.asOfDate,
      symbolCount: leftPreview.symbolOrder.length
    },
    right: {
      id: rightId,
      asOfDate: rightRun.asOfDate,
      symbolCount: rightPreview.symbolOrder.length
    },
    commonSymbols,
    topDriftPairs: driftPairs.slice(0, 50)
  };
}
