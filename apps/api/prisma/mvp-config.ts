// apps/api/prisma/mvp-config.ts
export type SeedUniverse = {
  id: string;
  name: string;
  symbols: string[];
};

export const DEMO_DATASET_ID = 'hk_eod_demo_v1';
export const DEMO_DATASET_NAME = 'Hong Kong EOD Demo v1';

// Use an exact, stable business-date range for the demo dataset.
// Current date is 2026-04-16, so the demo dataset intentionally ends on 2026-04-15.
export const DEMO_DATA_START = '2025-01-02';
export const DEMO_DATA_END = '2026-04-15';

export const SUPPORTED_WINDOW_DAYS = [60, 120, 252] as const;
export const MAX_WINDOW_DAYS = SUPPORTED_WINDOW_DAYS[SUPPORTED_WINDOW_DAYS.length - 1];
export const MIN_REQUIRED_PRICE_ROWS = MAX_WINDOW_DAYS + 1; // 252 returns need 253 prices

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const HK_SYMBOL_PATTERN = /^\d{4}\.HK$/;

export const SEED_UNIVERSES: SeedUniverse[] = [
  {
    id: 'hk_top_20',
    name: 'Hong Kong Top 20',
    symbols: [
      '0001.HK',
      '0002.HK',
      '0003.HK',
      '0005.HK',
      '0006.HK',
      '0011.HK',
      '0016.HK',
      '0017.HK',
      '0027.HK',
      '0066.HK',
      '0083.HK',
      '0101.HK',
      '0175.HK',
      '0267.HK',
      '0388.HK',
      '0700.HK',
      '0762.HK',
      '0939.HK',
      '0941.HK',
      '1299.HK'
    ]
  },
  {
    id: 'hk_financials_10',
    name: 'Hong Kong Financials 10',
    symbols: [
      '0005.HK',
      '0011.HK',
      '0023.HK',
      '0388.HK',
      '0939.HK',
      '1299.HK',
      '1398.HK',
      '2318.HK',
      '2388.HK',
      '2628.HK'
    ]
  }
];

export const ALL_DEMO_SYMBOLS = [...new Set(SEED_UNIVERSES.flatMap((u) => u.symbols))].sort(
  (a, b) => a.localeCompare(b)
);