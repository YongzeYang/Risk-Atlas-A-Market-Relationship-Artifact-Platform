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

type Sector = 'financials' | 'property' | 'tech' | 'telecom' | 'industrial' | 'utilities';

type SymbolProfile = {
  symbol: string;
  sector: Sector;
  startPrice: number;
  beta: number;
  sectorLoading: number;
  idioVol: number;
  drift: number;
};

export const DEFAULT_DEMO_CSV_PATH = fileURLToPath(
  new URL(`../../../data/sample/${DEMO_DATASET_ID}.csv`, import.meta.url)
);

const PROFILE_BY_SYMBOL: Record<string, Omit<SymbolProfile, 'symbol'>> = {
  '0001.HK': { sector: 'industrial', startPrice: 42, beta: 0.95, sectorLoading: 0.80, idioVol: 0.007, drift: 0.00020 },
  '0002.HK': { sector: 'utilities', startPrice: 70, beta: 0.70, sectorLoading: 0.75, idioVol: 0.005, drift: 0.00015 },
  '0003.HK': { sector: 'industrial', startPrice: 55, beta: 0.90, sectorLoading: 0.85, idioVol: 0.007, drift: 0.00018 },
  '0005.HK': { sector: 'financials', startPrice: 61, beta: 1.05, sectorLoading: 1.05, idioVol: 0.007, drift: 0.00022 },
  '0006.HK': { sector: 'utilities', startPrice: 34, beta: 0.75, sectorLoading: 0.85, idioVol: 0.006, drift: 0.00015 },
  '0011.HK': { sector: 'financials', startPrice: 115, beta: 0.95, sectorLoading: 1.00, idioVol: 0.006, drift: 0.00022 },
  '0016.HK': { sector: 'property', startPrice: 92, beta: 0.95, sectorLoading: 1.05, idioVol: 0.008, drift: 0.00018 },
  '0017.HK': { sector: 'property', startPrice: 29, beta: 1.00, sectorLoading: 1.10, idioVol: 0.009, drift: 0.00018 },
  '0023.HK': { sector: 'financials', startPrice: 24, beta: 0.95, sectorLoading: 1.00, idioVol: 0.007, drift: 0.00018 },
  '0027.HK': { sector: 'industrial', startPrice: 48, beta: 0.90, sectorLoading: 0.90, idioVol: 0.008, drift: 0.00018 },
  '0066.HK': { sector: 'industrial', startPrice: 14, beta: 1.00, sectorLoading: 0.90, idioVol: 0.010, drift: 0.00016 },
  '0083.HK': { sector: 'property', startPrice: 18, beta: 0.95, sectorLoading: 1.00, idioVol: 0.010, drift: 0.00016 },
  '0101.HK': { sector: 'property', startPrice: 12, beta: 0.95, sectorLoading: 1.00, idioVol: 0.010, drift: 0.00016 },
  '0175.HK': { sector: 'tech', startPrice: 16, beta: 1.20, sectorLoading: 1.10, idioVol: 0.014, drift: 0.00028 },
  '0267.HK': { sector: 'industrial', startPrice: 45, beta: 0.90, sectorLoading: 0.85, idioVol: 0.007, drift: 0.00018 },
  '0388.HK': { sector: 'financials', startPrice: 300, beta: 1.25, sectorLoading: 1.20, idioVol: 0.009, drift: 0.00025 },
  '0700.HK': { sector: 'tech', startPrice: 325, beta: 1.35, sectorLoading: 1.20, idioVol: 0.015, drift: 0.00035 },
  '0762.HK': { sector: 'telecom', startPrice: 5, beta: 0.85, sectorLoading: 0.95, idioVol: 0.010, drift: 0.00018 },
  '0939.HK': { sector: 'financials', startPrice: 8, beta: 1.00, sectorLoading: 1.10, idioVol: 0.007, drift: 0.00020 },
  '0941.HK': { sector: 'telecom', startPrice: 67, beta: 0.80, sectorLoading: 0.95, idioVol: 0.006, drift: 0.00020 },
  '1299.HK': { sector: 'financials', startPrice: 59, beta: 1.00, sectorLoading: 1.05, idioVol: 0.007, drift: 0.00022 },
  '1398.HK': { sector: 'financials', startPrice: 5, beta: 1.00, sectorLoading: 1.10, idioVol: 0.007, drift: 0.00018 },
  '2318.HK': { sector: 'financials', startPrice: 41, beta: 1.05, sectorLoading: 1.10, idioVol: 0.008, drift: 0.00020 },
  '2388.HK': { sector: 'financials', startPrice: 29, beta: 0.95, sectorLoading: 1.00, idioVol: 0.007, drift: 0.00018 },
  '2628.HK': { sector: 'financials', startPrice: 38, beta: 1.00, sectorLoading: 1.10, idioVol: 0.008, drift: 0.00018 }
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
  utilities: 0.0035
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
    utilities: mulberry32(1006)
  };

  const symbolNoiseRng = new Map<string, () => number>(
    PROFILES.map((profile) => [profile.symbol, mulberry32(hashString(profile.symbol))])
  );

  const latestPriceBySymbol = new Map<string, number>(
    PROFILES.map((profile) => [profile.symbol, profile.startPrice])
  );

  const lines: string[] = ['tradeDate,symbol,adjClose'];

  for (const tradeDate of dates) {
    const marketShock = 0.00020 + normal(marketRng) * 0.0080;

    const sectorShockBySector: Record<Sector, number> = {
      financials: normal(sectorRngBySector.financials) * SECTOR_SHOCK_SCALE.financials,
      property: normal(sectorRngBySector.property) * SECTOR_SHOCK_SCALE.property,
      tech: normal(sectorRngBySector.tech) * SECTOR_SHOCK_SCALE.tech,
      telecom: normal(sectorRngBySector.telecom) * SECTOR_SHOCK_SCALE.telecom,
      industrial: normal(sectorRngBySector.industrial) * SECTOR_SHOCK_SCALE.industrial,
      utilities: normal(sectorRngBySector.utilities) * SECTOR_SHOCK_SCALE.utilities
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
      lines.push(`${tradeDate},${profile.symbol},${nextPrice.toFixed(4)}`);
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