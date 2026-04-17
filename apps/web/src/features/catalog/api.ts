import { apiRequest } from '../../lib/http';
import type { DatasetListItem, UniverseListItem } from '../../types/api';

export async function listDatasets(): Promise<DatasetListItem[]> {
  return apiRequest<DatasetListItem[]>('/datasets');
}

export async function listUniverses(): Promise<UniverseListItem[]> {
  return apiRequest<UniverseListItem[]>('/universes');
}