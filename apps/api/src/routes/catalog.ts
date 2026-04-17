// apps/api/src/routes/catalog.ts
import type { FastifyPluginAsync } from 'fastify';

import { listDatasets, listUniverses } from '../services/catalog-service.js';

const nullableIsoDateSchema = {
  anyOf: [
    {
      type: 'string',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$'
    },
    {
      type: 'null'
    }
  ]
} as const;

const datasetItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    source: { type: 'string' },
    market: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    symbolCount: { type: 'integer' },
    priceRowCount: { type: 'integer' },
    minTradeDate: nullableIsoDateSchema,
    maxTradeDate: nullableIsoDateSchema
  },
  required: [
    'id',
    'name',
    'source',
    'market',
    'createdAt',
    'symbolCount',
    'priceRowCount',
    'minTradeDate',
    'maxTradeDate'
  ]
} as const;

const universeItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    market: { type: 'string' },
    symbolCount: { type: 'integer' },
    symbols: {
      type: 'array',
      items: {
        type: 'string'
      }
    },
    createdAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'name', 'market', 'symbolCount', 'symbols', 'createdAt']
} as const;

export const catalogRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/datasets',
    {
      schema: {
        tags: ['catalog'],
        summary: 'List datasets',
        response: {
          200: {
            type: 'array',
            items: datasetItemSchema
          }
        }
      }
    },
    async () => {
      return listDatasets();
    }
  );

  app.get(
    '/universes',
    {
      schema: {
        tags: ['catalog'],
        summary: 'List universes',
        response: {
          200: {
            type: 'array',
            items: universeItemSchema
          }
        }
      }
    },
    async () => {
      return listUniverses();
    }
  );
};