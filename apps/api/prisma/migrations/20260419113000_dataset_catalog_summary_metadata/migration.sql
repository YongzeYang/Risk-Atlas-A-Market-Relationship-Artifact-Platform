-- AlterTable
ALTER TABLE "datasets"
ADD COLUMN     "catalogSymbolCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "catalogPriceRowCount" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "catalogMinTradeDate" VARCHAR(10),
ADD COLUMN     "catalogMaxTradeDate" VARCHAR(10),
ADD COLUMN     "catalogFirstValidAsOf60" VARCHAR(10),
ADD COLUMN     "catalogFirstValidAsOf120" VARCHAR(10),
ADD COLUMN     "catalogFirstValidAsOf252" VARCHAR(10);

WITH dataset_stats AS (
  SELECT
    "datasetId",
    COUNT(*)::bigint AS "priceRowCount",
    COUNT(DISTINCT "symbol")::integer AS "symbolCount",
    MIN("tradeDate") AS "minTradeDate",
    MAX("tradeDate") AS "maxTradeDate"
  FROM "eod_prices"
  GROUP BY "datasetId"
),
dataset_first_valid AS (
  WITH distinct_trade_dates AS (
    SELECT DISTINCT "datasetId", "tradeDate"
    FROM "eod_prices"
  ),
  ranked_trade_dates AS (
    SELECT
      "datasetId",
      "tradeDate",
      ROW_NUMBER() OVER (PARTITION BY "datasetId" ORDER BY "tradeDate" ASC) AS rn
    FROM distinct_trade_dates
  )
  SELECT
    "datasetId",
    MAX(CASE WHEN rn = 61 THEN "tradeDate" END) AS "asOf60",
    MAX(CASE WHEN rn = 121 THEN "tradeDate" END) AS "asOf120",
    MAX(CASE WHEN rn = 253 THEN "tradeDate" END) AS "asOf252"
  FROM ranked_trade_dates
  WHERE rn IN (61, 121, 253)
  GROUP BY "datasetId"
)
UPDATE "datasets" AS datasets
SET
  "catalogSymbolCount" = dataset_stats."symbolCount",
  "catalogPriceRowCount" = dataset_stats."priceRowCount",
  "catalogMinTradeDate" = dataset_stats."minTradeDate",
  "catalogMaxTradeDate" = dataset_stats."maxTradeDate",
  "catalogFirstValidAsOf60" = dataset_first_valid."asOf60",
  "catalogFirstValidAsOf120" = dataset_first_valid."asOf120",
  "catalogFirstValidAsOf252" = dataset_first_valid."asOf252"
FROM dataset_stats
LEFT JOIN dataset_first_valid
  ON dataset_first_valid."datasetId" = dataset_stats."datasetId"
WHERE datasets."id" = dataset_stats."datasetId";