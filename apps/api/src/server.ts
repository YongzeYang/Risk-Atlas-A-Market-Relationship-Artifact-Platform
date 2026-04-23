// apps/api/src/server.ts

import 'dotenv/config';

import { buildApp } from './app.js';
import { disconnectPrisma } from './lib/prisma.js';
import { resumePendingAnalysisRuns } from './services/analysis-run-runner.js';
import { resumePendingBuildRuns } from './services/build-run-runner.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

function installShutdownHandlers(app: Awaited<ReturnType<typeof buildApp>>) {
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    app.log.info({ signal }, 'Shutting down Risk Atlas API.');

    let exitCode = 0;

    try {
      await app.close();
    } catch (error) {
      exitCode = 1;
      app.log.error(error, 'Failed to close Fastify cleanly.');
    }

    try {
      await disconnectPrisma();
    } catch (error) {
      exitCode = 1;
      app.log.error(error, 'Failed to close Prisma and pg pool cleanly.');
    }

    process.exit(exitCode);
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

async function main() {
  const app = await buildApp();
  installShutdownHandlers(app);
  await resumePendingAnalysisRuns();
  await resumePendingBuildRuns();

  await app.listen({
    port: PORT,
    host: HOST
  });

  app.log.info(`Risk Atlas API listening on http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  void disconnectPrisma()
    .catch(() => {
      // best effort during failed startup
    })
    .finally(() => {
      process.exit(1);
    });
});