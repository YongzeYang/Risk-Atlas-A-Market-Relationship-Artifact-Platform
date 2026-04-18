import type { FastifyPluginAsync } from 'fastify';

import {
  buildSeriesDetailResponseSchema,
  buildSeriesListItemSchema,
  createBuildSeriesBodySchema,
  type CreateBuildSeriesRequestBody
} from '../contracts/build-runs.js';
import { ServiceError } from '../lib/service-error.js';
import {
  createBuildSeries,
  getBuildSeriesDetail,
  listBuildSeries
} from '../services/build-series-service.js';

export const buildSeriesRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: CreateBuildSeriesRequestBody }>(
    '/build-series',
    {
      schema: {
        tags: ['build-series'],
        summary: 'Create a build series (rolling builds)',
        body: createBuildSeriesBodySchema,
        response: {
          202: buildSeriesListItemSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const series = await createBuildSeries(request.body);
        return reply.code(202).send(series);
      } catch (error) {
        if (error instanceof ServiceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        throw error;
      }
    }
  );

  app.get(
    '/build-series',
    {
      schema: {
        tags: ['build-series'],
        summary: 'List build series',
        response: {
          200: {
            type: 'array',
            items: buildSeriesListItemSchema
          }
        }
      }
    },
    async () => {
      return listBuildSeries();
    }
  );

  app.get<{ Params: { id: string } }>(
    '/build-series/:id',
    {
      schema: {
        tags: ['build-series'],
        summary: 'Get build series detail',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id']
        },
        response: {
          200: buildSeriesDetailResponseSchema
        }
      }
    },
    async (request, reply) => {
      const detail = await getBuildSeriesDetail(request.params.id);
      if (!detail) {
        return reply.code(404).send({ message: `Build series "${request.params.id}" not found.` });
      }
      return detail;
    }
  );
};
