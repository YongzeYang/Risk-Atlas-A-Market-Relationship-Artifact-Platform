WITH ranked_duplicates AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY "datasetId", "symbol", "tradeDate"
      ORDER BY "id" DESC
    ) AS rn
  FROM "eod_prices"
)
DELETE FROM "eod_prices"
WHERE ctid IN (
  SELECT ctid
  FROM ranked_duplicates
  WHERE rn > 1
);

CREATE UNIQUE INDEX "eod_prices_datasetId_symbol_tradeDate_key"
ON "eod_prices"("datasetId", "symbol", "tradeDate");