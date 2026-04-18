import { createReadStream } from 'node:fs';
import { access, constants } from 'node:fs/promises';
import type { FastifyPluginAsync } from 'fastify';

import {
  ARTIFACT_FILE_NAMES,
  analysisInviteHeadersSchema,
  buildRunDetailResponseSchema,
  buildRunIdParamSchema,
  buildRunListItemSchema,
  buildRunListResponseSchema,
  createBuildRunBodySchema,
  exposureQuerystringSchema,
  exposureResponseSchema,
  heatmapSubsetBodySchema,
  heatmapSubsetResponseSchema,
  neighborsQuerystringSchema,
  neighborsResponseSchema,
  pairDivergenceQuerystringSchema,
  pairDivergenceResponseSchema,
  pairScoreQuerystringSchema,
  pairScoreResponseSchema,
  structureQuerystringSchema,
  structureResponseSchema,
  type BuildRunIdParams,
  type CreateBuildRunRequestBody,
  type ExposureQuerystring,
  type HeatmapSubsetRequestBody,
  type NeighborsQuerystring,
  type PairDivergenceQuerystring,
  type PairScoreQuerystring,
  type StructureQuerystring
} from '../contracts/build-runs.js';
import { ServiceError } from '../lib/service-error.js';
import {
  createBuildRun,
  getBuildRunDetail,
  getBuildRunDownloadArtifact,
  listBuildRuns
} from '../services/build-run-service.js';
import {
  getBuildRunHeatmapSubset,
  getBuildRunNeighbors,
  getBuildRunPairScore
} from '../services/build-run-query-service.js';
import { getBuildRunExposure } from '../services/exposure-service.js';
import { requireInviteCodeHeader } from '../services/invite-code-service.js';
import { getBuildRunPairDivergence } from '../services/pair-divergence-service.js';
import { scheduleBuildRun } from '../services/build-run-runner.js';
import { resolveLocalStorageFilePath } from '../services/local-artifact-store.js';
import { getBuildRunStructure } from '../services/structure-service.js';

export const buildRunRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: CreateBuildRunRequestBody }>(
    '/build-runs',
    {
      schema: {
        tags: ['build-runs'],
        summary: 'Create a build run',
        body: createBuildRunBodySchema,
        response: {
          202: buildRunListItemSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const buildRun = await createBuildRun(request.body);
        scheduleBuildRun(buildRun.id);

        return reply.code(202).send(buildRun);
      } catch (error) {
        if (error instanceof ServiceError) {
          return reply.code(error.statusCode).send({
            message: error.message
          });
        }

        throw error;
      }
    }
  );

  app.get(
    '/build-runs',
    {
      schema: {
        tags: ['build-runs'],
        summary: 'List build runs',
        response: {
          200: buildRunListResponseSchema
        }
      }
    },
    async () => {
      return listBuildRuns();
    }
  );

  app.get<{ Params: BuildRunIdParams }>(
    '/build-runs/:id',
    {
      schema: {
        tags: ['build-runs'],
        summary: 'Get build run detail',
        params: buildRunIdParamSchema,
        response: {
          200: buildRunDetailResponseSchema
        }
      }
    },
    async (request, reply) => {
      const detail = await getBuildRunDetail(request.params.id);

      if (!detail) {
        return reply.code(404).send({
          message: `Build run "${request.params.id}" was not found.`
        });
      }

      return detail;
    }
  );

  app.get<{ Params: BuildRunIdParams; Querystring: PairScoreQuerystring }>(
    '/build-runs/:id/pair-score',
    {
      schema: {
        tags: ['build-runs'],
        summary: 'Get one pair score from matrix.bsm',
        params: buildRunIdParamSchema,
        querystring: pairScoreQuerystringSchema,
        response: {
          200: pairScoreResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        return await getBuildRunPairScore(request.params.id, request.query);
      } catch (error) {
        if (error instanceof ServiceError) {
          return reply.code(error.statusCode).send({
            message: error.message
          });
        }

        throw error;
      }
    }
  );

  app.get<{ Params: BuildRunIdParams; Querystring: NeighborsQuerystring }>(
    '/build-runs/:id/neighbors',
    {
      schema: {
        tags: ['build-runs'],
        summary: 'Get top-k neighbors for one symbol from matrix.bsm',
        params: buildRunIdParamSchema,
        querystring: neighborsQuerystringSchema,
        response: {
          200: neighborsResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        return await getBuildRunNeighbors(request.params.id, request.query);
      } catch (error) {
        if (error instanceof ServiceError) {
          return reply.code(error.statusCode).send({
            message: error.message
          });
        }

        throw error;
      }
    }
  );

  app.post<{ Params: BuildRunIdParams; Body: HeatmapSubsetRequestBody }>(
    '/build-runs/:id/heatmap-subset',
    {
      schema: {
        tags: ['build-runs'],
        summary: 'Get a small subset matrix for heatmap rendering from matrix.bsm',
        params: buildRunIdParamSchema,
        body: heatmapSubsetBodySchema,
        response: {
          200: heatmapSubsetResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        return await getBuildRunHeatmapSubset(request.params.id, request.body);
      } catch (error) {
        if (error instanceof ServiceError) {
          return reply.code(error.statusCode).send({
            message: error.message
          });
        }

        throw error;
      }
    }
  );

  app.get<{ Params: BuildRunIdParams; Querystring: PairDivergenceQuerystring }>(
    '/build-runs/:id/pair-divergence',
    {
      schema: {
        tags: ['build-runs'],
        summary: 'Get pair divergence candidates for one succeeded build',
        params: buildRunIdParamSchema,
        headers: analysisInviteHeadersSchema,
        querystring: pairDivergenceQuerystringSchema,
        response: {
          200: pairDivergenceResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        await requireInviteCodeHeader(request.headers);
        return await getBuildRunPairDivergence(request.params.id, request.query);
      } catch (error) {
        if (error instanceof ServiceError) {
          return reply.code(error.statusCode).send({
            message: error.message
          });
        }

        throw error;
      }
    }
  );

  app.get<{ Params: BuildRunIdParams; Querystring: ExposureQuerystring }>(
    '/build-runs/:id/exposure',
    {
      schema: {
        tags: ['build-runs'],
        summary: 'Get one-symbol co-movement exposure from matrix.bsm plus sector overlay',
        params: buildRunIdParamSchema,
        headers: analysisInviteHeadersSchema,
        querystring: exposureQuerystringSchema,
        response: {
          200: exposureResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        await requireInviteCodeHeader(request.headers);
        return await getBuildRunExposure(request.params.id, request.query);
      } catch (error) {
        if (error instanceof ServiceError) {
          return reply.code(error.statusCode).send({
            message: error.message
          });
        }

        throw error;
      }
    }
  );

  app.get<{ Params: BuildRunIdParams; Querystring: StructureQuerystring }>(
    '/build-runs/:id/structure',
    {
      schema: {
        tags: ['build-runs'],
        summary: 'Get clustered structure summary and ordered heatmap metadata for one build',
        params: buildRunIdParamSchema,
        headers: analysisInviteHeadersSchema,
        querystring: structureQuerystringSchema,
        response: {
          200: structureResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        await requireInviteCodeHeader(request.headers);
        return await getBuildRunStructure(request.params.id, request.query);
      } catch (error) {
        if (error instanceof ServiceError) {
          return reply.code(error.statusCode).send({
            message: error.message
          });
        }

        throw error;
      }
    }
  );

  app.get<{ Params: BuildRunIdParams }>(
    '/build-runs/:id/download',
    {
      schema: {
        tags: ['build-runs'],
        summary: 'Download matrix.bsm artifact for a succeeded build',
        params: buildRunIdParamSchema
      }
    },
    async (request, reply) => {
      try {
        const artifact = await getBuildRunDownloadArtifact(request.params.id);

        if (artifact.storageKind !== 'local_fs') {
          return reply.code(501).send({
            message: `Download for storageKind "${artifact.storageKind}" is not implemented in local mode.`
          });
        }

        const filePath = resolveLocalStorageFilePath(
          artifact.storagePrefix,
          ARTIFACT_FILE_NAMES.matrix
        );

        await access(filePath, constants.R_OK);

        reply.header('content-type', artifact.mediaType);
        reply.header(
          'content-disposition',
          `attachment; filename="${artifact.filename}"`
        );

        return reply.send(createReadStream(filePath));
      } catch (error) {
        if (error instanceof ServiceError) {
          return reply.code(error.statusCode).send({
            message: error.message
          });
        }

        throw error;
      }
    }
  );
};