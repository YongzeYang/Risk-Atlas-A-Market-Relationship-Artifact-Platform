// apps/api/src/server.ts

import 'dotenv/config';

import { buildApp } from './app.js';
import { resumePendingAnalysisRuns } from './services/analysis-run-runner.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main() {
  const app = await buildApp();
  await resumePendingAnalysisRuns();

  await app.listen({
    port: PORT,
    host: HOST
  });

  app.log.info(`Risk Atlas API listening on http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});