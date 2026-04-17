// apps/web/src/features/catalog/hooks.ts
import { useCallback, useEffect, useState } from 'react';

import { listDatasets, listUniverses } from './api';
import type { DatasetListItem, UniverseListItem } from '../../types/api';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error while loading catalog data.';
}

export function useCatalogData() {
  const [datasets, setDatasets] = useState<DatasetListItem[]>([]);
  const [universes, setUniverses] = useState<UniverseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);

    try {
      const [nextDatasets, nextUniverses] = await Promise.all([
        listDatasets(),
        listUniverses()
      ]);

      setDatasets(nextDatasets);
      setUniverses(nextUniverses);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    datasets,
    universes,
    loading,
    error,
    refresh
  };
}