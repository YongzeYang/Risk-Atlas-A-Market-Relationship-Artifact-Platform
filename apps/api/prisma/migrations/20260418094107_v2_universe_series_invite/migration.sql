-- CreateEnum
CREATE TYPE "SecurityType" AS ENUM ('common_equity', 'etf', 'reit', 'warrant', 'cbbc', 'stapled_security');

-- CreateEnum
CREATE TYPE "Sector" AS ENUM ('financials', 'property', 'tech', 'telecom', 'industrial', 'utilities', 'energy', 'consumer');

-- CreateEnum
CREATE TYPE "UniverseDefinitionKind" AS ENUM ('static', 'liquidity_top_n', 'sector_filter', 'all_common_equity');

-- CreateEnum
CREATE TYPE "SeriesFrequency" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateEnum
CREATE TYPE "BuildSeriesStatus" AS ENUM ('pending', 'running', 'succeeded', 'partially_failed', 'failed');

-- AlterTable
ALTER TABLE "artifacts" ADD COLUMN     "previewStrategy" TEXT NOT NULL DEFAULT 'dense_json',
ADD COLUMN     "topPairsJson" JSONB;

-- AlterTable
ALTER TABLE "build_runs" ADD COLUMN     "resolvedSymbolsJson" JSONB,
ADD COLUMN     "seriesId" TEXT;

-- AlterTable
ALTER TABLE "eod_prices" ADD COLUMN     "volume" BIGINT;

-- AlterTable
ALTER TABLE "universes" ADD COLUMN     "definitionKind" "UniverseDefinitionKind" NOT NULL DEFAULT 'static',
ADD COLUMN     "definitionParams" JSONB,
ALTER COLUMN "symbolsJson" DROP NOT NULL,
ALTER COLUMN "symbolCount" DROP NOT NULL;

-- CreateTable
CREATE TABLE "security_master" (
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "securityType" "SecurityType" NOT NULL,
    "sector" "Sector",
    "market" "Market" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_master_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "build_series" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "universeId" TEXT NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "scoreMethod" "ScoreMethod" NOT NULL,
    "startDate" VARCHAR(10) NOT NULL,
    "endDate" VARCHAR(10) NOT NULL,
    "frequency" "SeriesFrequency" NOT NULL,
    "status" "BuildSeriesStatus" NOT NULL DEFAULT 'pending',
    "totalRunCount" INTEGER NOT NULL DEFAULT 0,
    "completedRunCount" INTEGER NOT NULL DEFAULT 0,
    "failedRunCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "build_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_codes" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "label" TEXT,
    "usesLeft" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "build_series_status_createdAt_idx" ON "build_series"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_codeHash_key" ON "invite_codes"("codeHash");

-- CreateIndex
CREATE INDEX "build_runs_seriesId_asOfDate_idx" ON "build_runs"("seriesId", "asOfDate");

-- AddForeignKey
ALTER TABLE "build_runs" ADD CONSTRAINT "build_runs_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "build_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_series" ADD CONSTRAINT "build_series_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_series" ADD CONSTRAINT "build_series_universeId_fkey" FOREIGN KEY ("universeId") REFERENCES "universes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
