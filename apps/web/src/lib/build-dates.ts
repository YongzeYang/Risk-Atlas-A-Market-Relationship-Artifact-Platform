import type { BuildRunWindowDays, DatasetListItem } from '../types/api';

export function getEarliestBuildableAsOfDate(
  dataset: DatasetListItem | null,
  windowDays: BuildRunWindowDays
): string | null {
  if (!dataset) {
    return null;
  }

  return dataset.firstValidAsOfByWindowDays[`${windowDays}`] ?? dataset.minTradeDate ?? null;
}