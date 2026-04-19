// apps/api/src/routes/catalog.ts
import type { FastifyPluginAsync } from 'fastify';

import { listDatasets, listUniverses, listSecurityMaster } from '../services/catalog-service.js';

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
    maxTradeDate: nullableIsoDateSchema,
    firstValidAsOfByWindowDays: {
      type: 'object',
      additionalProperties: false,
      properties: {
        '60': nullableIsoDateSchema,
        '120': nullableIsoDateSchema,
        '252': nullableIsoDateSchema
      },
      required: ['60', '120', '252']
    }
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
    'maxTradeDate',
    'firstValidAsOfByWindowDays'
  ]
} as const;

const nullableIntegerSchema = {
  anyOf: [{ type: 'integer' }, { type: 'null' }]
} as const;

const universeItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    market: { type: 'string' },
    symbolCount: nullableIntegerSchema,
    symbols: {
      type: 'array',
      items: {
        type: 'string'
      }
    },
    definitionKind: { type: 'string' },
    definitionParams: {},
    supportedDatasetIds: {
      anyOf: [
        {
          type: 'array',
          items: { type: 'string' }
        },
        { type: 'null' }
      ]
    },
    createdAt: { type: 'string', format: 'date-time' }
  },
  required: [
    'id',
    'name',
    'market',
    'symbolCount',
    'symbols',
    'definitionKind',
    'supportedDatasetIds',
    'createdAt'
  ]
} as const;

const securityMasterItemSchema = {
  type: 'object',
  properties: {
    symbol: { type: 'string' },
    name: { type: 'string' },
    shortName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    securityType: { type: 'string' },
    sector: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    market: { type: 'string' }
  },
  required: ['symbol', 'name', 'securityType', 'market']
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

  app.get(
    '/security-master',
    {
      schema: {
        tags: ['catalog'],
        summary: 'List security master entries',
        response: {
          200: {
            type: 'array',
            items: securityMasterItemSchema
          }
        }
      }
    },
    async () => {
      return listSecurityMaster();
    }
  );
};