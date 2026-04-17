import { useCallback, useEffect, useState } from 'react';

import { getBuildRunDetail, listBuildRuns } from './api';
import type { BuildRunDetailResponse, BuildRunListItem } from '../../types/api';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error while loading build data.';
}

export function useBuildRunsData(pollMs = 3000) {
  const [buildRuns, setBuildRuns] = useState<BuildRunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError(null);

    try {
      const next = await listBuildRuns();
      setBuildRuns(next);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let timerId: number | undefined;

    const run = async (mode: 'initial' | 'refresh') => {
      if (!active) {
        return;
      }

      await refresh(mode);

      if (!active) {
        return;
      }

      timerId = window.setTimeout(() => {
        void run('refresh');
      }, pollMs);
    };

    void run('initial');

    return () => {
      active = false;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [pollMs, refresh]);

  return {
    buildRuns,
    loading,
    refreshing,
    error,
    refresh: () => refresh('refresh')
  };
}

export function useBuildDetailData(buildRunId: string | undefined, pollMs = 2000) {
  const [detail, setDetail] = useState<BuildRunDetailResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(buildRunId));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (mode: 'initial' | 'refresh' = 'refresh') => {
      if (!buildRunId) {
        setDetail(null);
        setLoading(false);
        return null;
      }

      if (mode === 'initial') {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError(null);

      try {
        const next = await getBuildRunDetail(buildRunId);
        setDetail(next);
        return next;
      } catch (err) {
        setError(toErrorMessage(err));
        return null;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [buildRunId]
  );

  useEffect(() => {
    let active = true;
    let timerId: number | undefined;

    const run = async (mode: 'initial' | 'refresh') => {
      if (!active) {
        return;
      }

      const next = await refresh(mode);

      if (!active) {
        return;
      }

      if (next && (next.status === 'pending' || next.status === 'running')) {
        timerId = window.setTimeout(() => {
          void run('refresh');
        }, pollMs);
      }
    };

    void run('initial');

    return () => {
      active = false;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [pollMs, refresh]);

  return {
    detail,
    loading,
    refreshing,
    error,
    refresh: () => refresh('refresh')
  };
}