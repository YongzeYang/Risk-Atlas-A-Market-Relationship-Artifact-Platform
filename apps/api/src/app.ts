import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';

export async function buildApp() {
  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty'
      }
    }
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Risk Atlas API',
        description: 'Weekend MVP API for Risk Atlas',
        version: '0.1.0'
      }
    }
  });

  await app.register(swaggerUI, {
    routePrefix: '/docs'
  });

  app.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Health check',
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              service: { type: 'string' }
            }
          }
        }
      }
    },
    async () => {
      return {
        ok: true,
        service: 'risk-atlas-api'
      };
    }
  );

  return app;
}