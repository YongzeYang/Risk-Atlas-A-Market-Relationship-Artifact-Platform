import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

import { analysisRunRoutes } from './routes/analysis-runs.js';
import { buildRunRoutes } from './routes/build-runs.js';
import { buildSeriesRoutes } from './routes/build-series.js';
import { catalogRoutes } from './routes/catalog.js';
import { compareRoutes } from './routes/compare.js';

const require = createRequire(import.meta.url);
const swaggerUiStaticDir = dirname(require.resolve('@fastify/swagger-ui/static/index.html'));

const swaggerUiHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Risk Atlas API Docs</title>
    <link rel="stylesheet" type="text/css" href="/docs/assets/swagger-ui.css" />
    <link rel="stylesheet" type="text/css" href="/docs/assets/index.css" />
    <link rel="icon" type="image/png" href="/docs/assets/favicon-32x32.png" sizes="32x32" />
    <link rel="icon" type="image/png" href="/docs/assets/favicon-16x16.png" sizes="16x16" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/docs/assets/swagger-ui-bundle.js" charset="UTF-8"></script>
    <script src="/docs/assets/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
    <script src="/docs/swagger-initializer.js" charset="UTF-8"></script>
  </body>
</html>`;

const swaggerUiInitializerScript = `window.onload = function () {
  window.ui = SwaggerUIBundle({
    url: '/docs/json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [
      SwaggerUIBundle.presets.apis,
      SwaggerUIStandalonePreset
    ],
    plugins: [
      SwaggerUIBundle.plugins.DownloadUrl
    ],
    layout: 'StandaloneLayout',
    validatorUrl: null
  });
};`;

function buildAllowedCorsOrigins(): Set<string> {
  const webPort = String(process.env.WEB_PORT ?? '5173').trim() || '5173';
  const explicitOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([
    ...explicitOrigins,
    `http://localhost:${webPort}`,
    `http://127.0.0.1:${webPort}`
  ]);
}

function isAllowedCorsOrigin(origin: string | undefined, allowedOrigins: Set<string>): boolean {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.has(origin)) {
    return true;
  }

  try {
    const parsedOrigin = new URL(origin);

    return (
      (parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:') &&
      (parsedOrigin.hostname === 'localhost' || parsedOrigin.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}

export async function buildApp() {
  const usePrettyLogger = process.env.NODE_ENV !== 'production';
  const allowedCorsOrigins = buildAllowedCorsOrigins();

  const app = Fastify({
    logger: usePrettyLogger
      ? {
          transport: {
            target: 'pino-pretty'
          }
        }
      : true
  });

  await app.register(fastifyCors, {
    origin(origin, callback) {
      if (isAllowedCorsOrigin(origin, allowedCorsOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin "${origin}" is not allowed by CORS.`), false);
    }
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Risk Atlas API',
        description: 'MVP API for Risk Atlas',
        version: '0.1.0'
      }
    }
  });

  await app.register(fastifyStatic, {
    root: swaggerUiStaticDir,
    prefix: '/docs/assets/',
    decorateReply: false
  });

  app.get(
    '/docs',
    {
      schema: {
        hide: true
      }
    },
    async (_request, reply) => {
      return reply.redirect('/docs/');
    }
  );

  app.get(
    '/docs/',
    {
      schema: {
        hide: true
      }
    },
    async (_request, reply) => {
      return reply.type('text/html; charset=utf-8').send(swaggerUiHtml);
    }
  );

  app.get(
    '/docs/swagger-initializer.js',
    {
      schema: {
        hide: true
      }
    },
    async (_request, reply) => {
      return reply.type('application/javascript; charset=utf-8').send(swaggerUiInitializerScript);
    }
  );

  app.get(
    '/docs/json',
    {
      schema: {
        hide: true
      }
    },
    async () => {
      return app.swagger();
    }
  );

  app.get(
    '/docs/yaml',
    {
      schema: {
        hide: true
      }
    },
    async (_request, reply) => {
      return reply.type('application/x-yaml').send(app.swagger({ yaml: true }));
    }
  );

  await app.register(catalogRoutes);
  await app.register(buildRunRoutes);
  await app.register(buildSeriesRoutes);
  await app.register(analysisRunRoutes);
  await app.register(compareRoutes);

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
            },
            required: ['ok', 'service']
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