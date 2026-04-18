import type { FastifyPluginAsync } from 'fastify';

import {
  analysisRunDetailResponseSchema,
  analysisRunIdParamSchema,
  analysisRunListQuerystringSchema,
  analysisRunListResponseSchema,
  createExposureAnalysisRunBodySchema,
  createPairDivergenceAnalysisRunBodySchema,
  createStructureAnalysisRunBodySchema,
  type AnalysisRunIdParams,
  type AnalysisRunListQuerystring,
  type CreateExposureAnalysisRunRequestBody,
  type CreatePairDivergenceAnalysisRunRequestBody,
  type CreateStructureAnalysisRunRequestBody
} from '../contracts/analysis-runs.js';
import { analysisInviteHeadersSchema } from '../contracts/build-runs.js';
import { ServiceError } from '../lib/service-error.js';
import { requireInviteCodeHeader } from '../services/invite-code-service.js';
import {
  createExposureAnalysisRun,
  createPairDivergenceAnalysisRun,
  createStructureAnalysisRun,
  getAnalysisRun,
  listAnalysisRuns
} from '../services/analysis-run-service.js';

export const analysisRunRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: CreatePairDivergenceAnalysisRunRequestBody }>(
    '/analysis-runs/pair-divergence',
    {
      schema: {
        tags: ['analysis-runs'],
        summary: 'Queue one pair-divergence analysis run',
        headers: analysisInviteHeadersSchema,
        body: createPairDivergenceAnalysisRunBodySchema
      }
    },
    async (request, reply) => {
      try {
        await requireInviteCodeHeader(request.headers);
        const run = await createPairDivergenceAnalysisRun(request.body);
        return reply.code(202).send(run);
      } catch (error) {
        if (error instanceof ServiceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        throw error;
      }
    }
  );

  app.post<{ Body: CreateExposureAnalysisRunRequestBody }>(
    '/analysis-runs/exposure',
    {
      schema: {
        tags: ['analysis-runs'],
        summary: 'Queue one exposure analysis run',
        headers: analysisInviteHeadersSchema,
        body: createExposureAnalysisRunBodySchema
      }
    },
    async (request, reply) => {
      try {
        await requireInviteCodeHeader(request.headers);
        const run = await createExposureAnalysisRun(request.body);
        return reply.code(202).send(run);
      } catch (error) {
        if (error instanceof ServiceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        throw error;
      }
    }
  );

  app.post<{ Body: CreateStructureAnalysisRunRequestBody }>(
    '/analysis-runs/structure',
    {
      schema: {
        tags: ['analysis-runs'],
        summary: 'Queue one structure analysis run',
        headers: analysisInviteHeadersSchema,
        body: createStructureAnalysisRunBodySchema
      }
    },
    async (request, reply) => {
      try {
        await requireInviteCodeHeader(request.headers);
        const run = await createStructureAnalysisRun(request.body);
        return reply.code(202).send(run);
      } catch (error) {
        if (error instanceof ServiceError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        throw error;
      }
    }
  );

  app.get<{ Querystring: AnalysisRunListQuerystring }>(
    '/analysis-runs',
    {
      schema: {
        tags: ['analysis-runs'],
        summary: 'List recent analysis runs',
        querystring: analysisRunListQuerystringSchema,
        response: {
          200: analysisRunListResponseSchema
        }
      }
    },
    async (request) => {
      return listAnalysisRuns(request.query);
    }
  );

  app.get<{ Params: AnalysisRunIdParams }>(
    '/analysis-runs/:id',
    {
      schema: {
        tags: ['analysis-runs'],
        summary: 'Get one analysis run detail and result',
        params: analysisRunIdParamSchema,
        response: {
          200: analysisRunDetailResponseSchema
        }
      }
    },
    async (request, reply) => {
      const run = await getAnalysisRun(request.params.id);
      if (!run) {
        return reply.code(404).send({
          message: `Analysis run "${request.params.id}" was not found.`
        });
      }

      return run;
    }
  );
};