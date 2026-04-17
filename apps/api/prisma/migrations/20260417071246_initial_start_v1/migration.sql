-- CreateEnum
CREATE TYPE "ScoreMethod" AS ENUM ('pearson_corr');

-- CreateEnum
CREATE TYPE "BuildStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "ArtifactStorageKind" AS ENUM ('local_fs', 's3');

-- CreateEnum
CREATE TYPE "DatasetSource" AS ENUM ('curated_csv');

-- CreateEnum
CREATE TYPE "Market" AS ENUM ('HK');

-- CreateTable
CREATE TABLE "datasets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "DatasetSource" NOT NULL,
    "market" "Market" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "universes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "symbolsJson" JSONB NOT NULL,
    "symbolCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "universes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eod_prices" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "tradeDate" VARCHAR(10) NOT NULL,
    "symbol" TEXT NOT NULL,
    "adjClose" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "eod_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "build_runs" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "asOfDate" VARCHAR(10) NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "scoreMethod" "ScoreMethod" NOT NULL,
    "status" "BuildStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "build_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" TEXT NOT NULL,
    "buildRunId" TEXT NOT NULL,
    "bundleVersion" INTEGER NOT NULL DEFAULT 1,
    "storageKind" "ArtifactStorageKind" NOT NULL DEFAULT 'local_fs',
    "storageBucket" VARCHAR(128),
    "storagePrefix" TEXT NOT NULL,
    "matrixByteSize" BIGINT,
    "previewByteSize" BIGINT,
    "manifestByteSize" BIGINT,
    "symbolCount" INTEGER NOT NULL,
    "minScore" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eod_prices_datasetId_tradeDate_idx" ON "eod_prices"("datasetId", "tradeDate");

-- CreateIndex
CREATE INDEX "eod_prices_datasetId_symbol_idx" ON "eod_prices"("datasetId", "symbol");

-- CreateIndex
CREATE INDEX "build_runs_status_createdAt_idx" ON "build_runs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "build_runs_datasetId_asOfDate_idx" ON "build_runs"("datasetId", "asOfDate");

-- CreateIndex
CREATE INDEX "build_runs_universeId_asOfDate_idx" ON "build_runs"("universeId", "asOfDate");

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_buildRunId_key" ON "artifacts"("buildRunId");

-- CreateIndex
CREATE INDEX "artifacts_storageKind_createdAt_idx" ON "artifacts"("storageKind", "createdAt");

-- AddForeignKey
ALTER TABLE "eod_prices" ADD CONSTRAINT "eod_prices_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_runs" ADD CONSTRAINT "build_runs_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_runs" ADD CONSTRAINT "build_runs_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "universes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_buildRunId_fkey" FOREIGN KEY ("buildRunId") REFERENCES "build_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
