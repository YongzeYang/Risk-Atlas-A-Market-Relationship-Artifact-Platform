// apps/web/src/features/catalog/hooks.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { listDatasets, listUniverses } from './api';
import type { DatasetListItem, UniverseListItem } from '../../types/api';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error while loading catalog data.';
}

const CATALOG_CACHE_TTL_MS = 30_000;

type CacheEntry<T> = {
  value: T | null;
  fetchedAt: number;
  promise: Promise<T> | null;
};

const datasetsCache: CacheEntry<DatasetListItem[]> = {
  value: null,
  fetchedAt: 0,
  promise: null
};

const universesCache: CacheEntry<UniverseListItem[]> = {
  value: null,
  fetchedAt: 0,
  promise: null
};

function isFresh<T>(cache: CacheEntry<T>): cache is CacheEntry<T> & { value: T } {
  return cache.value !== null && Date.now() - cache.fetchedAt < CATALOG_CACHE_TTL_MS;
}

async function readThroughCache<T>(
  cache: CacheEntry<T>,
  loader: () => Promise<T>,
  force = false
): Promise<T> {
  if (!force && isFresh(cache)) {
    return cache.value;
  }

  if (cache.promise) {
    return cache.promise;
  }

  cache.promise = loader()
    .then((value) => {
      cache.value = value;
      cache.fetchedAt = Date.now();
      return value;
    })
    .finally(() => {
      cache.promise = null;
    });

  return cache.promise;
}

export function useCatalogData() {
  const mountedRef = useRef(true);
  const [datasets, setDatasets] = useState<DatasetListItem[]>(() => datasetsCache.value ?? []);
  const [universes, setUniverses] = useState<UniverseListItem[]>(() => universesCache.value ?? []);
  const [datasetsLoading, setDatasetsLoading] = useState(() => datasetsCache.value === null);
  const [universesLoading, setUniversesLoading] = useState(() => universesCache.value === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force ?? false;
    setError(null);

    const datasetNeedsFetch = force || !isFresh(datasetsCache);
    const universeNeedsFetch = force || !isFresh(universesCache);

    if (datasetsCache.value !== null) {
      setDatasets(datasetsCache.value);
    }

    if (universesCache.value !== null) {
      setUniverses(universesCache.value);
    }

    if (datasetNeedsFetch && datasetsCache.value === null) {
      setDatasetsLoading(true);
    } else {
      setDatasetsLoading(false);
    }

    if (universeNeedsFetch && universesCache.value === null) {
      setUniversesLoading(true);
    } else {
      setUniversesLoading(false);
    }

    const tasks: Promise<void>[] = [];

    if (datasetNeedsFetch) {
      tasks.push(
        readThroughCache(datasetsCache, listDatasets, force)
          .then((nextDatasets) => {
            if (!mountedRef.current) {
              return;
            }

            setDatasets(nextDatasets);
          })
          .catch((err) => {
            if (!mountedRef.current || datasetsCache.value !== null) {
              return;
            }

            setError((current) => current ?? toErrorMessage(err));
          })
          .finally(() => {
            if (mountedRef.current) {
              setDatasetsLoading(false);
            }
          })
      );
    }

    if (universeNeedsFetch) {
      tasks.push(
        readThroughCache(universesCache, listUniverses, force)
          .then((nextUniverses) => {
            if (!mountedRef.current) {
              return;
            }

            setUniverses(nextUniverses);
          })
          .catch((err) => {
            if (!mountedRef.current || universesCache.value !== null) {
              return;
            }

            setError((current) => current ?? toErrorMessage(err));
          })
          .finally(() => {
            if (mountedRef.current) {
              setUniversesLoading(false);
            }
          })
      );
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    datasets,
    universes,
    loading: datasetsLoading || universesLoading,
    datasetsLoading,
    universesLoading,
    error,
    refresh
  };
}