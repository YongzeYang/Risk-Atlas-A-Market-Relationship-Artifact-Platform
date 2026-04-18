// apps/api/prisma/generate-sample-eod.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALL_DEMO_SYMBOLS,
  DEMO_DATASET_ID,
  DEMO_DATA_END,
  DEMO_DATA_START
} from './mvp-config.js';

type Sector = 'financials' | 'property' | 'tech' | 'telecom' | 'industrial' | 'utilities' | 'energy' | 'consumer';

type SymbolProfile = {
  symbol: string;
  sector: Sector;
  startPrice: number;
  beta: number;
  sectorLoading: number;
  idioVol: number;
  drift: number;
  baseVolume: number;
};

export const DEFAULT_DEMO_CSV_PATH = fileURLToPath(
  new URL(`../../../data/sample/${DEMO_DATASET_ID}.csv`, import.meta.url)
);

const PROFILE_BY_SYMBOL: Record<string, Omit<SymbolProfile, 'symbol'>> = {
  // --- Existing 25 symbols (updated sectors for 0003, 0027) ---
  '0001.HK': { sector: 'industrial', startPrice: 42, beta: 0.95, sectorLoading: 0.80, idioVol: 0.007, drift: 0.00020, baseVolume: 5_000_000 },
  '0002.HK': { sector: 'utilities', startPrice: 70, beta: 0.70, sectorLoading: 0.75, idioVol: 0.005, drift: 0.00015, baseVolume: 3_000_000 },
  '0003.HK': { sector: 'utilities', startPrice: 55, beta: 0.90, sectorLoading: 0.85, idioVol: 0.007, drift: 0.00018, baseVolume: 3_000_000 },
  '0005.HK': { sector: 'financials', startPrice: 61, beta: 1.05, sectorLoading: 1.05, idioVol: 0.007, drift: 0.00022, baseVolume: 30_000_000 },
  '0006.HK': { sector: 'utilities', startPrice: 34, beta: 0.75, sectorLoading: 0.85, idioVol: 0.006, drift: 0.00015, baseVolume: 2_000_000 },
  '0011.HK': { sector: 'financials', startPrice: 115, beta: 0.95, sectorLoading: 1.00, idioVol: 0.006, drift: 0.00022, baseVolume: 5_000_000 },
  '0016.HK': { sector: 'property', startPrice: 92, beta: 0.95, sectorLoading: 1.05, idioVol: 0.008, drift: 0.00018, baseVolume: 3_000_000 },
  '0017.HK': { sector: 'property', startPrice: 29, beta: 1.00, sectorLoading: 1.10, idioVol: 0.009, drift: 0.00018, baseVolume: 5_000_000 },
  '0023.HK': { sector: 'financials', startPrice: 24, beta: 0.95, sectorLoading: 1.00, idioVol: 0.007, drift: 0.00018, baseVolume: 3_000_000 },
  '0027.HK': { sector: 'consumer', startPrice: 48, beta: 0.90, sectorLoading: 0.90, idioVol: 0.008, drift: 0.00018, baseVolume: 8_000_000 },
  '0066.HK': { sector: 'industrial', startPrice: 14, beta: 1.00, sectorLoading: 0.90, idioVol: 0.010, drift: 0.00016, baseVolume: 4_000_000 },
  '0083.HK': { sector: 'property', startPrice: 18, beta: 0.95, sectorLoading: 1.00, idioVol: 0.010, drift: 0.00016, baseVolume: 4_000_000 },
  '0101.HK': { sector: 'property', startPrice: 12, beta: 0.95, sectorLoading: 1.00, idioVol: 0.010, drift: 0.00016, baseVolume: 5_000_000 },
  '0175.HK': { sector: 'industrial', startPrice: 16, beta: 1.20, sectorLoading: 1.10, idioVol: 0.014, drift: 0.00028, baseVolume: 25_000_000 },
  '0267.HK': { sector: 'industrial', startPrice: 45, beta: 0.90, sectorLoading: 0.85, idioVol: 0.007, drift: 0.00018, baseVolume: 8_000_000 },
  '0388.HK': { sector: 'financials', startPrice: 300, beta: 1.25, sectorLoading: 1.20, idioVol: 0.009, drift: 0.00025, baseVolume: 8_000_000 },
  '0700.HK': { sector: 'tech', startPrice: 325, beta: 1.35, sectorLoading: 1.20, idioVol: 0.015, drift: 0.00035, baseVolume: 15_000_000 },
  '0762.HK': { sector: 'telecom', startPrice: 5, beta: 0.85, sectorLoading: 0.95, idioVol: 0.010, drift: 0.00018, baseVolume: 15_000_000 },
  '0939.HK': { sector: 'financials', startPrice: 8, beta: 1.00, sectorLoading: 1.10, idioVol: 0.007, drift: 0.00020, baseVolume: 150_000_000 },
  '0941.HK': { sector: 'telecom', startPrice: 67, beta: 0.80, sectorLoading: 0.95, idioVol: 0.006, drift: 0.00020, baseVolume: 10_000_000 },
  '1299.HK': { sector: 'financials', startPrice: 59, beta: 1.00, sectorLoading: 1.05, idioVol: 0.007, drift: 0.00022, baseVolume: 15_000_000 },
  '1398.HK': { sector: 'financials', startPrice: 5, beta: 1.00, sectorLoading: 1.10, idioVol: 0.007, drift: 0.00018, baseVolume: 180_000_000 },
  '2318.HK': { sector: 'financials', startPrice: 41, beta: 1.05, sectorLoading: 1.10, idioVol: 0.008, drift: 0.00020, baseVolume: 25_000_000 },
  '2388.HK': { sector: 'financials', startPrice: 29, beta: 0.95, sectorLoading: 1.00, idioVol: 0.007, drift: 0.00018, baseVolume: 4_000_000 },
  '2628.HK': { sector: 'financials', startPrice: 38, beta: 1.00, sectorLoading: 1.10, idioVol: 0.008, drift: 0.00018, baseVolume: 20_000_000 },
  // --- 35 new symbols ---
  '0012.HK': { sector: 'property', startPrice: 30, beta: 0.90, sectorLoading: 1.00, idioVol: 0.009, drift: 0.00016, baseVolume: 2_000_000 },
  '0019.HK': { sector: 'industrial', startPrice: 65, beta: 0.85, sectorLoading: 0.80, idioVol: 0.007, drift: 0.00016, baseVolume: 2_000_000 },
  '0241.HK': { sector: 'tech', startPrice: 4, beta: 1.30, sectorLoading: 1.15, idioVol: 0.018, drift: 0.00030, baseVolume: 10_000_000 },
  '0285.HK': { sector: 'tech', startPrice: 28, beta: 1.25, sectorLoading: 1.10, idioVol: 0.016, drift: 0.00028, baseVolume: 5_000_000 },
  '0288.HK': { sector: 'consumer', startPrice: 6, beta: 0.80, sectorLoading: 0.85, idioVol: 0.008, drift: 0.00015, baseVolume: 10_000_000 },
  '0291.HK': { sector: 'consumer', startPrice: 52, beta: 0.85, sectorLoading: 0.90, idioVol: 0.009, drift: 0.00018, baseVolume: 5_000_000 },
  '0386.HK': { sector: 'energy', startPrice: 4, beta: 1.00, sectorLoading: 1.05, idioVol: 0.010, drift: 0.00018, baseVolume: 30_000_000 },
  '0669.HK': { sector: 'industrial', startPrice: 95, beta: 0.90, sectorLoading: 0.80, idioVol: 0.008, drift: 0.00020, baseVolume: 2_000_000 },
  '0688.HK': { sector: 'property', startPrice: 22, beta: 1.00, sectorLoading: 1.05, idioVol: 0.010, drift: 0.00018, baseVolume: 8_000_000 },
  '0823.HK': { sector: 'property', startPrice: 58, beta: 0.70, sectorLoading: 0.75, idioVol: 0.006, drift: 0.00020, baseVolume: 4_000_000 },
  '0857.HK': { sector: 'energy', startPrice: 6, beta: 1.05, sectorLoading: 1.10, idioVol: 0.012, drift: 0.00020, baseVolume: 25_000_000 },
  '0868.HK': { sector: 'industrial', startPrice: 12, beta: 1.10, sectorLoading: 0.95, idioVol: 0.013, drift: 0.00022, baseVolume: 6_000_000 },
  '0883.HK': { sector: 'energy', startPrice: 11, beta: 1.10, sectorLoading: 1.15, idioVol: 0.012, drift: 0.00022, baseVolume: 20_000_000 },
  '0960.HK': { sector: 'property', startPrice: 15, beta: 1.10, sectorLoading: 1.15, idioVol: 0.015, drift: 0.00015, baseVolume: 6_000_000 },
  '0968.HK': { sector: 'energy', startPrice: 8, beta: 1.15, sectorLoading: 1.10, idioVol: 0.016, drift: 0.00025, baseVolume: 8_000_000 },
  '1038.HK': { sector: 'utilities', startPrice: 50, beta: 0.65, sectorLoading: 0.80, idioVol: 0.005, drift: 0.00015, baseVolume: 2_000_000 },
  '1044.HK': { sector: 'consumer', startPrice: 40, beta: 0.75, sectorLoading: 0.80, idioVol: 0.007, drift: 0.00016, baseVolume: 3_000_000 },
  '1088.HK': { sector: 'energy', startPrice: 28, beta: 0.95, sectorLoading: 1.05, idioVol: 0.010, drift: 0.00020, baseVolume: 10_000_000 },
  '1109.HK': { sector: 'property', startPrice: 35, beta: 1.00, sectorLoading: 1.05, idioVol: 0.010, drift: 0.00018, baseVolume: 10_000_000 },
  '1113.HK': { sector: 'property', startPrice: 48, beta: 0.85, sectorLoading: 0.95, idioVol: 0.008, drift: 0.00016, baseVolume: 3_000_000 },
  '1177.HK': { sector: 'tech', startPrice: 4, beta: 1.20, sectorLoading: 1.05, idioVol: 0.016, drift: 0.00025, baseVolume: 15_000_000 },
  '1211.HK': { sector: 'industrial', startPrice: 250, beta: 1.30, sectorLoading: 1.00, idioVol: 0.018, drift: 0.00035, baseVolume: 8_000_000 },
  '1288.HK': { sector: 'financials', startPrice: 3, beta: 0.95, sectorLoading: 1.10, idioVol: 0.007, drift: 0.00016, baseVolume: 120_000_000 },
  '1928.HK': { sector: 'consumer', startPrice: 22, beta: 1.00, sectorLoading: 0.95, idioVol: 0.012, drift: 0.00018, baseVolume: 8_000_000 },
  '1997.HK': { sector: 'property', startPrice: 38, beta: 0.85, sectorLoading: 0.95, idioVol: 0.009, drift: 0.00016, baseVolume: 2_000_000 },
  '2007.HK': { sector: 'property', startPrice: 1, beta: 1.20, sectorLoading: 1.20, idioVol: 0.025, drift: -0.00010, baseVolume: 15_000_000 },
  '2018.HK': { sector: 'tech', startPrice: 25, beta: 1.20, sectorLoading: 1.10, idioVol: 0.015, drift: 0.00022, baseVolume: 4_000_000 },
  '2020.HK': { sector: 'consumer', startPrice: 85, beta: 1.10, sectorLoading: 0.95, idioVol: 0.012, drift: 0.00025, baseVolume: 4_000_000 },
  '2269.HK': { sector: 'tech', startPrice: 35, beta: 1.25, sectorLoading: 1.15, idioVol: 0.018, drift: 0.00028, baseVolume: 8_000_000 },
  '2313.HK': { sector: 'industrial', startPrice: 70, beta: 1.00, sectorLoading: 0.85, idioVol: 0.010, drift: 0.00020, baseVolume: 3_000_000 },
  '2319.HK': { sector: 'consumer', startPrice: 32, beta: 0.85, sectorLoading: 0.90, idioVol: 0.009, drift: 0.00018, baseVolume: 6_000_000 },
  '2382.HK': { sector: 'tech', startPrice: 90, beta: 1.30, sectorLoading: 1.20, idioVol: 0.018, drift: 0.00030, baseVolume: 5_000_000 },
  '2688.HK': { sector: 'utilities', startPrice: 110, beta: 0.80, sectorLoading: 0.85, idioVol: 0.008, drift: 0.00020, baseVolume: 3_000_000 },
  '3328.HK': { sector: 'financials', startPrice: 5, beta: 0.95, sectorLoading: 1.05, idioVol: 0.007, drift: 0.00018, baseVolume: 60_000_000 },
  '3988.HK': { sector: 'financials', startPrice: 3, beta: 0.95, sectorLoading: 1.10, idioVol: 0.007, drift: 0.00016, baseVolume: 100_000_000 },
};

const PROFILES: SymbolProfile[] = ALL_DEMO_SYMBOLS.map((symbol) => {
  const profile = PROFILE_BY_SYMBOL[symbol];
  if (!profile) {
    throw new Error(`Missing deterministic sample profile for symbol "${symbol}".`);
  }

  return {
    symbol,
    ...profile
  };
});

const SECTOR_SHOCK_SCALE: Record<Sector, number> = {
  financials: 0.0060,
  property: 0.0070,
  tech: 0.0090,
  telecom: 0.0045,
  industrial: 0.0055,
  utilities: 0.0035,
  energy: 0.0075,
  consumer: 0.0050
};

function mulberry32(seed: number) {
  let t = seed >>> 0;

  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normal(prng: () => number): number {
  let u = 0;
  let v = 0;

  while (u === 0) u = prng();
  while (v === 0) v = prng();

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function businessDays(startIsoDate: string, endIsoDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${startIsoDate}T00:00:00Z`);
  const end = new Date(`${endIsoDate}T00:00:00Z`);

  while (current <= end) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(current.toISOString().slice(0, 10));
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

export async function writeDeterministicHkEodDemoCsv(outputPath = DEFAULT_DEMO_CSV_PATH) {
  const dates = businessDays(DEMO_DATA_START, DEMO_DATA_END);

  const marketRng = mulberry32(20260416);
  const sectorRngBySector: Record<Sector, () => number> = {
    financials: mulberry32(1001),
    property: mulberry32(1002),
    tech: mulberry32(1003),
    telecom: mulberry32(1004),
    industrial: mulberry32(1005),
    utilities: mulberry32(1006),
    energy: mulberry32(1007),
    consumer: mulberry32(1008)
  };

  const symbolNoiseRng = new Map<string, () => number>(
    PROFILES.map((profile) => [profile.symbol, mulberry32(hashString(profile.symbol))])
  );

  const latestPriceBySymbol = new Map<string, number>(
    PROFILES.map((profile) => [profile.symbol, profile.startPrice])
  );

  const volumeNoiseRng = new Map<string, () => number>(
    PROFILES.map((profile) => [profile.symbol, mulberry32(hashString(`vol_${profile.symbol}`))])
  );

  const lines: string[] = ['tradeDate,symbol,adjClose,volume'];

  for (const tradeDate of dates) {
    const marketShock = 0.00020 + normal(marketRng) * 0.0080;

    const sectorShockBySector: Record<Sector, number> = {
      financials: normal(sectorRngBySector.financials) * SECTOR_SHOCK_SCALE.financials,
      property: normal(sectorRngBySector.property) * SECTOR_SHOCK_SCALE.property,
      tech: normal(sectorRngBySector.tech) * SECTOR_SHOCK_SCALE.tech,
      telecom: normal(sectorRngBySector.telecom) * SECTOR_SHOCK_SCALE.telecom,
      industrial: normal(sectorRngBySector.industrial) * SECTOR_SHOCK_SCALE.industrial,
      utilities: normal(sectorRngBySector.utilities) * SECTOR_SHOCK_SCALE.utilities,
      energy: normal(sectorRngBySector.energy) * SECTOR_SHOCK_SCALE.energy,
      consumer: normal(sectorRngBySector.consumer) * SECTOR_SHOCK_SCALE.consumer
    };

    for (const profile of PROFILES) {
      const idio = normal(symbolNoiseRng.get(profile.symbol)!) * profile.idioVol;

      const rawReturn =
        profile.drift +
        profile.beta * marketShock +
        profile.sectorLoading * sectorShockBySector[profile.sector] +
        idio;

      const clippedReturn = Math.max(-0.12, Math.min(0.12, rawReturn));

      const prevPrice = latestPriceBySymbol.get(profile.symbol) ?? profile.startPrice;
      const nextPrice = Math.max(1, prevPrice * Math.exp(clippedReturn));

      latestPriceBySymbol.set(profile.symbol, nextPrice);

      const volRng = volumeNoiseRng.get(profile.symbol)!;
      const volumeMultiplier = Math.exp(normal(volRng) * 0.3) * (1 + Math.abs(clippedReturn) * 5);
      const volume = Math.max(1000, Math.round(profile.baseVolume * volumeMultiplier));

      lines.push(`${tradeDate},${profile.symbol},${nextPrice.toFixed(4)},${volume}`);
    }
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');

  return {
    outputPath,
    symbolCount: PROFILES.length,
    rowCount: PROFILES.length * dates.length,
    minTradeDate: dates[0],
    maxTradeDate: dates[dates.length - 1]
  };
}

async function main() {
  const summary = await writeDeterministicHkEodDemoCsv();
  console.log(
    `Generated demo CSV at ${summary.outputPath} with ${summary.rowCount} rows ` +
      `(${summary.symbolCount} symbols, ${summary.minTradeDate}..${summary.maxTradeDate}).`
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    console.error('Failed to generate demo CSV:', error);
    process.exit(1);
  });
}