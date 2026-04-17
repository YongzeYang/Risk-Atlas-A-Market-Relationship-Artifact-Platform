import type { FastifyPluginAsync } from 'fastify';

import {
  buildRunDetailResponseSchema,
  buildRunIdParamSchema,
  buildRunListItemSchema,
  buildRunListResponseSchema,
  createBuildRunBodySchema,
  type BuildRunIdParams,
  type CreateBuildRunRequestBody
} from '../contracts/build-runs.js';
import { ServiceError } from '../lib/service-error.js';
import {
  createBuildRun,
  getBuildRunDetail,
  listBuildRuns
} from '../services/build-run-service.js';
import { scheduleBuildRun } from '../services/build-run-runner.js';

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
};