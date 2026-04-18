// apps/web/src/features/catalog/api.ts
import { apiRequest } from '../../lib/http';
import type { DatasetListItem, SecurityMasterItem, UniverseListItem } from '../../types/api';

export async function listDatasets(): Promise<DatasetListItem[]> {
  return apiRequest<DatasetListItem[]>('/datasets');
}

export async function listUniverses(): Promise<UniverseListItem[]> {
  return apiRequest<UniverseListItem[]>('/universes');
}

export async function listSecurityMaster(): Promise<SecurityMasterItem[]> {
  return apiRequest<SecurityMasterItem[]>('/security-master');
}