import type { Prisma } from '@prisma/client';

import {
  HK_SYMBOL_PATTERN_SOURCE,
  MAX_BUILD_UNIVERSE_SIZE,
  MIN_BUILD_UNIVERSE_SIZE
} from '../contracts/build-runs.js';

const symbolRegex = new RegExp(HK_SYMBOL_PATTERN_SOURCE);

function isStringArray(value: Prisma.JsonValue): value is string[] {
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string');
}

export function parseUniverseSymbolsJson(value: Prisma.JsonValue): string[] {
  if (!isStringArray(value)) {
    throw new Error('Universe symbolsJson must be a JSON string array.');
  }

  const normalized = value.map((item) => item.trim().toUpperCase());

  if (
    normalized.length < MIN_BUILD_UNIVERSE_SIZE ||
    normalized.length > MAX_BUILD_UNIVERSE_SIZE
  ) {
    throw new Error(
      `Universe symbol count must be between ${MIN_BUILD_UNIVERSE_SIZE} and ${MAX_BUILD_UNIVERSE_SIZE}.`
    );
  }

  const unique = new Set(normalized);
  if (unique.size !== normalized.length) {
    throw new Error('Universe symbolsJson contains duplicate symbols.');
  }

  for (const symbol of normalized) {
    if (!symbolRegex.test(symbol)) {
      throw new Error(`Invalid symbol "${symbol}" in universe symbolsJson.`);
    }
  }

  return normalized;
}