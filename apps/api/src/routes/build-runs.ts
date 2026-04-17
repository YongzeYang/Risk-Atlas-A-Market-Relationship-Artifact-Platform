import { createReadStream } from 'node:fs';
import { access, constants } from 'node:fs/promises';
import type { FastifyPluginAsync } from 'fastify';

import {
  ARTIFACT_FILE_NAMES,
  buildRunDetailResponseSchema,
  buildRunIdParamSchema,
  buildRunListItemSchema,
  buildRunListResponseSchema,
  createBuildRunBodySchema,
  heatmapSubsetBodySchema,
  heatmapSubsetResponseSchema,
  neighborsQuerystringSchema,
  neighborsResponseSchema,
  pairScoreQuerystringSchema,
  pairScoreResponseSchema,
  type BuildRunIdParams,
  type CreateBuildRunRequestBody,
  type HeatmapSubsetRequestBody,
  type NeighborsQuerystring,
  type PairScoreQuerystring
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
import { scheduleBuildRun } from '../services/build-run-runner.js';
import { resolveLocalStorageFilePath } from '../services/local-artifact-store.js';

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
        summary: 'Get one pair score from preview.json',
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
        summary: 'Get top-k neighbors for one symbol from preview.json',
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
        summary: 'Get a small subset matrix for heatmap rendering from preview.json',
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