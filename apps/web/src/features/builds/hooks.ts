// apps/web/src/features/builds/hooks.ts
import { useCallback, useEffect, useState } from 'react';

import { getBuildRunDetail, getBuildSeriesDetail, listBuildRuns, listBuildSeries } from './api';
import type { BuildRunDetailResponse, BuildRunListItem, BuildSeriesDetailResponse, BuildSeriesListItem } from '../../types/api';

const INVITE_CODE_STORAGE_KEY = 'risk-atlas:invite-code';

export function useInviteCode() {
  const [inviteCode, setInviteCode] = useState(() => {
    try {
      return localStorage.getItem(INVITE_CODE_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });

  const updateInviteCode = useCallback((code: string) => {
    setInviteCode(code);
    try {
      if (code) {
        localStorage.setItem(INVITE_CODE_STORAGE_KEY, code);
      } else {
        localStorage.removeItem(INVITE_CODE_STORAGE_KEY);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  return { inviteCode, setInviteCode: updateInviteCode };
}

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

export function useBuildSeriesData(pollMs = 5000) {
  const [series, setSeries] = useState<BuildSeriesListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') setLoading(true);
    setError(null);
    try {
      setSeries(await listBuildSeries());
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let timerId: number | undefined;

    const run = async (mode: 'initial' | 'refresh') => {
      if (!active) return;
      await refresh(mode);
      if (!active) return;
      timerId = window.setTimeout(() => void run('refresh'), pollMs);
    };

    void run('initial');
    return () => { active = false; if (timerId) window.clearTimeout(timerId); };
  }, [pollMs, refresh]);

  return { series, loading, error, refresh: () => refresh('refresh') };
}

export function useBuildSeriesDetailData(seriesId: string | undefined, pollMs = 3000) {
  const [detail, setDetail] = useState<BuildSeriesDetailResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(seriesId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (mode: 'initial' | 'refresh' = 'refresh') => {
      if (!seriesId) {
        setDetail(null);
        setLoading(false);
        return null;
      }

      if (mode === 'initial') setLoading(true);
      setError(null);

      try {
        const next = await getBuildSeriesDetail(seriesId);
        setDetail(next);
        return next;
      } catch (err) {
        setError(toErrorMessage(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [seriesId]
  );

  useEffect(() => {
    let active = true;
    let timerId: number | undefined;

    const run = async (mode: 'initial' | 'refresh') => {
      if (!active) return;
      const next = await refresh(mode);
      if (!active) return;

      if (next && (next.status === 'pending' || next.status === 'running')) {
        timerId = window.setTimeout(() => void run('refresh'), pollMs);
      }
    };

    void run('initial');
    return () => { active = false; if (timerId) window.clearTimeout(timerId); };
  }, [pollMs, refresh]);

  return { detail, loading, error, refresh: () => refresh('refresh') };
}