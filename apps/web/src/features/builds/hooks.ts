// apps/web/src/features/builds/hooks.ts
import { useCallback, useEffect, useState } from 'react';

import {
  getAnalysisRun,
  getBuildRunDetail,
  getBuildSeriesDetail,
  validateBuildRun,
  listAnalysisRuns,
  listBuildRuns,
  listBuildSeries
} from './api';
import type {
  AnalysisRunDetailResponse,
  AnalysisRunKind,
  AnalysisRunListItem,
  BuildRequestValidationResponse,
  BuildRunDetailResponse,
  BuildRunListItem,
  BuildRunWindowDays,
  BuildSeriesDetailResponse,
  BuildSeriesListItem
} from '../../types/api';

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

export function useBuildRequestValidation(args: {
  datasetId: string;
  universeId: string;
  asOfDate: string;
  windowDays: BuildRunWindowDays;
  enabled: boolean;
  debounceMs?: number;
}) {
  const {
    datasetId,
    universeId,
    asOfDate,
    windowDays,
    enabled,
    debounceMs = 200
  } = args;
  const [validation, setValidation] = useState<BuildRequestValidationResponse | null>(null);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !datasetId || !universeId || !asOfDate) {
      setValidation(null);
      setValidating(false);
      setError(null);
      return;
    }

    let active = true;
    setValidation(null);
    setError(null);
    const timerId = window.setTimeout(() => {
      setValidating(true);

      void validateBuildRun({ datasetId, universeId, asOfDate, windowDays })
        .then((result) => {
          if (!active) {
            return;
          }

          setValidation(result);
        })
        .catch((err) => {
          if (!active) {
            return;
          }

          setValidation(null);
          setError(toErrorMessage(err));
        })
        .finally(() => {
          if (active) {
            setValidating(false);
          }
        });
    }, debounceMs);

    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [asOfDate, datasetId, debounceMs, enabled, universeId, windowDays]);

  return {
    validation,
    validating,
    error
  };
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

export function useAnalysisRunData(runId: string | undefined, pollMs = 2000) {
  const [run, setRun] = useState<AnalysisRunDetailResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(runId));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (mode: 'initial' | 'refresh' = 'refresh') => {
      if (!runId) {
        setRun(null);
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
        const next = await getAnalysisRun(runId);
        setRun(next);
        return next;
      } catch (err) {
        setError(toErrorMessage(err));
        return null;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [runId]
  );

  useEffect(() => {
    let active = true;
    let timerId: number | undefined;

    const loop = async (mode: 'initial' | 'refresh') => {
      if (!active) {
        return;
      }

      const next = await refresh(mode);
      if (!active) {
        return;
      }

      if (next && (next.status === 'pending' || next.status === 'running')) {
        timerId = window.setTimeout(() => {
          void loop('refresh');
        }, pollMs);
      }
    };

    void loop('initial');

    return () => {
      active = false;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [pollMs, refresh]);

  return {
    run,
    loading,
    refreshing,
    error,
    refresh: () => refresh('refresh')
  };
}

export function useAnalysisRunListData(
  kind: AnalysisRunKind | undefined,
  buildRunId: string | undefined,
  pollMs = 5000,
  enabled = Boolean(kind && buildRunId)
) {
  const [runs, setRuns] = useState<AnalysisRunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (mode: 'initial' | 'refresh' = 'refresh') => {
      if (!enabled || !kind || !buildRunId) {
        setRuns([]);
        setLoading(false);
        setRefreshing(false);
        setError(null);
        return;
      }

      if (mode === 'initial') {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError(null);

      try {
        const next = await listAnalysisRuns({ kind, buildRunId, limit: 8 });
        setRuns(next);
      } catch (err) {
        setError(toErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [buildRunId, enabled, kind]
  );

  useEffect(() => {
    if (!enabled || !kind || !buildRunId) {
      setRuns([]);
      setLoading(false);
      setRefreshing(false);
      setError(null);
      return;
    }

    let active = true;
    let timerId: number | undefined;

    const loop = async (mode: 'initial' | 'refresh') => {
      if (!active) {
        return;
      }

      await refresh(mode);
      if (!active) {
        return;
      }

      timerId = window.setTimeout(() => {
        void loop('refresh');
      }, pollMs);
    };

    void loop('initial');

    return () => {
      active = false;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [buildRunId, enabled, kind, pollMs, refresh]);

  return {
    runs,
    loading,
    refreshing,
    error,
    refresh: () => refresh('refresh')
  };
}