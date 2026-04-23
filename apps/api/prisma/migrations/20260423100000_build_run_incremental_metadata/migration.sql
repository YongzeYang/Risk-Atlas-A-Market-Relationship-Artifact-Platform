CREATE TYPE "BuildStrategy" AS ENUM ('full', 'incremental');

ALTER TABLE "build_runs"
ADD COLUMN "buildStrategy" "BuildStrategy" NOT NULL DEFAULT 'full',
ADD COLUMN "previousBuildRunId" TEXT,
ADD COLUMN "sourceDatasetMaxTradeDate" VARCHAR(10),
ADD COLUMN "symbolSetHash" VARCHAR(64);

ALTER TABLE "build_runs"
ADD CONSTRAINT "build_runs_previousBuildRunId_fkey"
FOREIGN KEY ("previousBuildRunId") REFERENCES "build_runs"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "build_runs_dataset_universe_score_window_asof_idx"
ON "build_runs"("datasetId", "universeId", "scoreMethod", "windowDays", "asOfDate");