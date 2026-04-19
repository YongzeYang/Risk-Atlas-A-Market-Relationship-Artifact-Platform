import { prisma } from '../lib/prisma.js';

export async function listDatasetTradeDatesInRange(
  datasetId: string,
  startDate: string,
  endDate: string
): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ tradeDate: string }[]>(
    `SELECT DISTINCT "tradeDate"
     FROM "eod_prices"
     WHERE "datasetId" = $1
       AND "tradeDate" >= $2
       AND "tradeDate" <= $3
     ORDER BY "tradeDate" ASC`,
    datasetId,
    startDate,
    endDate
  );

  return rows.map((row) => row.tradeDate);
}