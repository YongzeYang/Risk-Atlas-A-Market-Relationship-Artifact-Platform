// apps/api/prisma/mvp-config.ts
export type SeedUniverse = {
  id: string;
  name: string;
  definitionKind: 'static' | 'liquidity_top_n' | 'sector_filter' | 'all_common_equity';
  symbols?: string[];
  definitionParams?: Record<string, unknown>;
};

export type SeedSecurityMasterEntry = {
  symbol: string;
  name: string;
  shortName?: string;
  securityType: 'common_equity' | 'etf' | 'reit';
  sector?:
    | 'financials'
    | 'property'
    | 'tech'
    | 'telecom'
    | 'industrial'
    | 'utilities'
    | 'energy'
    | 'consumer';
};

export const DEMO_DATASET_ID = 'hk_eod_demo_v1';
export const DEMO_DATASET_NAME = 'Hong Kong EOD Demo v1';

export const DEMO_DATA_START = '2025-01-02';
export const DEMO_DATA_END = '2026-04-15';

export const SUPPORTED_WINDOW_DAYS = [60, 120, 252] as const;
export const MAX_WINDOW_DAYS = SUPPORTED_WINDOW_DAYS[SUPPORTED_WINDOW_DAYS.length - 1];
export const MIN_REQUIRED_PRICE_ROWS = MAX_WINDOW_DAYS + 1;

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const HK_SYMBOL_PATTERN = /^\d{4}\.HK$/;

export const SEED_INVITE_CODE = 'risk-atlas-demo-2026';
export const SEED_INVITE_SALT = 'risk_atlas_v2_invite_salt';

export const SEED_INVITE_CODES = [
  { code: 'risk-atlas-demo-2026', label: 'demo-2026' },
  { code: '3191-4b0d-8461', label: 'user-private' }
] as const;

export const SECURITY_MASTER: SeedSecurityMasterEntry[] = [
  { symbol: '0001.HK', name: 'CK Hutchison Holdings', shortName: 'CK Hutch', securityType: 'common_equity', sector: 'industrial' },
  { symbol: '0002.HK', name: 'CLP Holdings', shortName: 'CLP', securityType: 'common_equity', sector: 'utilities' },
  { symbol: '0003.HK', name: 'Hong Kong and China Gas', shortName: 'HK&CG', securityType: 'common_equity', sector: 'utilities' },
  { symbol: '0005.HK', name: 'HSBC Holdings', shortName: 'HSBC', securityType: 'common_equity', sector: 'financials' },
  { symbol: '0006.HK', name: 'Power Assets Holdings', shortName: 'Power Assets', securityType: 'common_equity', sector: 'utilities' },
  { symbol: '0011.HK', name: 'Hang Seng Bank', shortName: 'HS Bank', securityType: 'common_equity', sector: 'financials' },
  { symbol: '0012.HK', name: 'Henderson Land Development', shortName: 'Henderson', securityType: 'common_equity', sector: 'property' },
  { symbol: '0016.HK', name: 'Sun Hung Kai Properties', shortName: 'SHKP', securityType: 'common_equity', sector: 'property' },
  { symbol: '0017.HK', name: 'New World Development', shortName: 'NW Dev', securityType: 'common_equity', sector: 'property' },
  { symbol: '0019.HK', name: 'Swire Pacific', shortName: 'Swire', securityType: 'common_equity', sector: 'industrial' },
  { symbol: '0023.HK', name: 'Bank of East Asia', shortName: 'BEA', securityType: 'common_equity', sector: 'financials' },
  { symbol: '0027.HK', name: 'Galaxy Entertainment', shortName: 'Galaxy', securityType: 'common_equity', sector: 'consumer' },
  { symbol: '0066.HK', name: 'MTR Corporation', shortName: 'MTR', securityType: 'common_equity', sector: 'industrial' },
  { symbol: '0083.HK', name: 'Sino Land', shortName: 'Sino Land', securityType: 'common_equity', sector: 'property' },
  { symbol: '0101.HK', name: 'Hang Lung Properties', shortName: 'Hang Lung', securityType: 'common_equity', sector: 'property' },
  { symbol: '0175.HK', name: 'Geely Automobile', shortName: 'Geely', securityType: 'common_equity', sector: 'industrial' },
  { symbol: '0241.HK', name: 'Alibaba Health Information', shortName: 'Ali Health', securityType: 'common_equity', sector: 'tech' },
  { symbol: '0267.HK', name: 'CITIC', shortName: 'CITIC', securityType: 'common_equity', sector: 'industrial' },
  { symbol: '0285.HK', name: 'BYD Electronic', shortName: 'BYD Elec', securityType: 'common_equity', sector: 'tech' },
  { symbol: '0288.HK', name: 'WH Group', shortName: 'WH Group', securityType: 'common_equity', sector: 'consumer' },
  { symbol: '0291.HK', name: 'China Resources Beer', shortName: 'CR Beer', securityType: 'common_equity', sector: 'consumer' },
  { symbol: '0386.HK', name: 'China Petroleum & Chemical', shortName: 'Sinopec', securityType: 'common_equity', sector: 'energy' },
  { symbol: '0388.HK', name: 'Hong Kong Exchanges & Clearing', shortName: 'HKEX', securityType: 'common_equity', sector: 'financials' },
  { symbol: '0669.HK', name: 'Techtronic Industries', shortName: 'Techtronic', securityType: 'common_equity', sector: 'industrial' },
  { symbol: '0688.HK', name: 'China Overseas Land & Investment', shortName: 'COLI', securityType: 'common_equity', sector: 'property' },
  { symbol: '0700.HK', name: 'Tencent Holdings', shortName: 'Tencent', securityType: 'common_equity', sector: 'tech' },
  { symbol: '0762.HK', name: 'China Unicom', shortName: 'China Unicom', securityType: 'common_equity', sector: 'telecom' },
  { symbol: '0823.HK', name: 'Link Real Estate Investment Trust', shortName: 'Link REIT', securityType: 'reit', sector: 'property' },
  { symbol: '0857.HK', name: 'PetroChina', shortName: 'PetroChina', securityType: 'common_equity', sector: 'energy' },
  { symbol: '0868.HK', name: 'Xinyi Glass Holdings', shortName: 'Xinyi Glass', securityType: 'common_equity', sector: 'industrial' },
  { symbol: '0883.HK', name: 'CNOOC', shortName: 'CNOOC', securityType: 'common_equity', sector: 'energy' },
  { symbol: '0939.HK', name: 'China Construction Bank', shortName: 'CCB', securityType: 'common_equity', sector: 'financials' },
  { symbol: '0941.HK', name: 'China Mobile', shortName: 'China Mobile', securityType: 'common_equity', sector: 'telecom' },
  { symbol: '0960.HK', name: 'Longfor Group', shortName: 'Longfor', securityType: 'common_equity', sector: 'property' },
  { symbol: '0968.HK', name: 'Xinyi Solar Holdings', shortName: 'Xinyi Solar', securityType: 'common_equity', sector: 'energy' },
  { symbol: '1038.HK', name: 'CK Infrastructure Holdings', shortName: 'CKI', securityType: 'common_equity', sector: 'utilities' },
  { symbol: '1044.HK', name: 'Hengan International', shortName: 'Hengan', securityType: 'common_equity', sector: 'consumer' },
  { symbol: '1088.HK', name: 'China Shenhua Energy', shortName: 'Shenhua', securityType: 'common_equity', sector: 'energy' },
  { symbol: '1109.HK', name: 'China Resources Land', shortName: 'CR Land', securityType: 'common_equity', sector: 'property' },
  { symbol: '1113.HK', name: 'CK Asset Holdings', shortName: 'CK Asset', securityType: 'common_equity', sector: 'property' },
  { symbol: '1177.HK', name: 'Sino Biopharmaceutical', shortName: 'Sino Biopharma', securityType: 'common_equity', sector: 'tech' },
  { symbol: '1211.HK', name: 'BYD Company', shortName: 'BYD', securityType: 'common_equity', sector: 'industrial' },
  { symbol: '1288.HK', name: 'Agricultural Bank of China', shortName: 'AgBank', securityType: 'common_equity', sector: 'financials' },
  { symbol: '1299.HK', name: 'AIA Group', shortName: 'AIA', securityType: 'common_equity', sector: 'financials' },
  { symbol: '1398.HK', name: 'ICBC', shortName: 'ICBC', securityType: 'common_equity', sector: 'financials' },
  { symbol: '1928.HK', name: 'Sands China', shortName: 'Sands', securityType: 'common_equity', sector: 'consumer' },
  { symbol: '1997.HK', name: 'Wharf Real Estate Investment', shortName: 'Wharf REIC', securityType: 'common_equity', sector: 'property' },
  { symbol: '2007.HK', name: 'Country Garden Holdings', shortName: 'Country Garden', securityType: 'common_equity', sector: 'property' },
  { symbol: '2018.HK', name: 'AAC Technologies', shortName: 'AAC Tech', securityType: 'common_equity', sector: 'tech' },
  { symbol: '2020.HK', name: 'ANTA Sports', shortName: 'ANTA', securityType: 'common_equity', sector: 'consumer' },
  { symbol: '2269.HK', name: 'WuXi Biologics', shortName: 'WuXi Bio', securityType: 'common_equity', sector: 'tech' },
  { symbol: '2313.HK', name: 'Shenzhou International', shortName: 'Shenzhou', securityType: 'common_equity', sector: 'industrial' },
  { symbol: '2318.HK', name: 'Ping An Insurance', shortName: 'Ping An', securityType: 'common_equity', sector: 'financials' },
  { symbol: '2319.HK', name: 'China Mengniu Dairy', shortName: 'Mengniu', securityType: 'common_equity', sector: 'consumer' },
  { symbol: '2382.HK', name: 'Sunny Optical Technology', shortName: 'Sunny', securityType: 'common_equity', sector: 'tech' },
  { symbol: '2388.HK', name: 'BOC Hong Kong', shortName: 'BOCHK', securityType: 'common_equity', sector: 'financials' },
  { symbol: '2628.HK', name: 'China Life Insurance', shortName: 'China Life', securityType: 'common_equity', sector: 'financials' },
  { symbol: '2688.HK', name: 'ENN Energy', shortName: 'ENN', securityType: 'common_equity', sector: 'utilities' },
  { symbol: '3328.HK', name: 'Bank of Communications', shortName: 'BoCom', securityType: 'common_equity', sector: 'financials' },
  { symbol: '3988.HK', name: 'Bank of China', shortName: 'BoC', securityType: 'common_equity', sector: 'financials' },
];

export const SEED_UNIVERSES: SeedUniverse[] = [
  {
    id: 'hk_top_20',
    name: 'Hong Kong Top 20',
    definitionKind: 'static',
    symbols: [
      '0001.HK', '0002.HK', '0003.HK', '0005.HK', '0006.HK',
      '0011.HK', '0016.HK', '0017.HK', '0027.HK', '0066.HK',
      '0083.HK', '0101.HK', '0175.HK', '0267.HK', '0388.HK',
      '0700.HK', '0762.HK', '0939.HK', '0941.HK', '1299.HK'
    ]
  },
  {
    id: 'hk_financials_10',
    name: 'Hong Kong Financials 10',
    definitionKind: 'static',
    symbols: [
      '0005.HK', '0011.HK', '0023.HK', '0388.HK', '0939.HK',
      '1299.HK', '1398.HK', '2318.HK', '2388.HK', '2628.HK'
    ]
  },
  {
    id: 'hk_top_50_liquid',
    name: 'HK Top 50 Liquid',
    definitionKind: 'liquidity_top_n',
    definitionParams: { topN: 50, advDays: 20 }
  },
  {
    id: 'hk_all_common_equity',
    name: 'HK All Common Equities',
    definitionKind: 'all_common_equity',
    definitionParams: {}
  },
  {
    id: 'hk_financials',
    name: 'HK Financials',
    definitionKind: 'sector_filter',
    definitionParams: { sectors: ['financials'] }
  },
  {
    id: 'hk_property',
    name: 'HK Property',
    definitionKind: 'sector_filter',
    definitionParams: { sectors: ['property'] }
  },
  {
    id: 'hk_tech',
    name: 'HK Technology',
    definitionKind: 'sector_filter',
    definitionParams: { sectors: ['tech'] }
  },
  {
    id: 'hk_energy',
    name: 'HK Energy',
    definitionKind: 'sector_filter',
    definitionParams: { sectors: ['energy'] }
  }
];

export const ALL_DEMO_SYMBOLS = [...new Set([
  ...SECURITY_MASTER.map((s) => s.symbol),
  ...SEED_UNIVERSES.flatMap((u) => u.symbols ?? [])
])].sort((a, b) => a.localeCompare(b));