// apps/web/src/app/pages/compare/ComparePage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Panel from '../../../components/ui/Panel';
import SectionHeader from '../../../components/ui/SectionHeader';
import { useBuildRunsData } from '../../../features/builds/hooks';
import { formatDateOnly } from '../../../lib/format';
import { compareBuilds } from '../../../features/builds/api';
import type { BuildRunListItem, CompareBuildsResponse } from '../../../types/api';

export default function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [leftId, setLeftId] = useState(searchParams.get('left') ?? '');
  const [rightId, setRightId] = useState(searchParams.get('right') ?? '');
  const [result, setResult] = useState<CompareBuildsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { buildRuns, loading: buildRunsLoading } = useBuildRunsData(5000);
  const comparableBuilds = useMemo(
    () => buildRuns.filter((item) => item.status === 'succeeded'),
    [buildRuns]
  );

  useEffect(() => {
    if (comparableBuilds.length === 0) {
      return;
    }

    const queryLeft = searchParams.get('left') ?? '';
    const queryRight = searchParams.get('right') ?? '';
    const hasComparable = (id: string) => comparableBuilds.some((item) => item.id === id);

    if (!leftId) {
      setLeftId(hasComparable(queryLeft) ? queryLeft : comparableBuilds[0]?.id ?? '');
    }

    if (!rightId) {
      const fallbackRight = comparableBuilds.find((item) => item.id !== (hasComparable(queryLeft) ? queryLeft : comparableBuilds[0]?.id))?.id ?? '';
      setRightId(hasComparable(queryRight) ? queryRight : fallbackRight);
    }
  }, [comparableBuilds, leftId, rightId, searchParams]);

  const leftBuild = useMemo(
    () => comparableBuilds.find((item) => item.id === leftId) ?? null,
    [comparableBuilds, leftId]
  );
  const rightBuild = useMemo(
    () => comparableBuilds.find((item) => item.id === rightId) ?? null,
    [comparableBuilds, rightId]
  );

  const handleCompare = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!leftId || !rightId) return;

      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const data = await compareBuilds(leftId.trim(), rightId.trim());
        setResult(data);
        setSearchParams({ left: leftId.trim(), right: rightId.trim() });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Compare failed.');
      } finally {
        setLoading(false);
      }
    },
    [leftId, rightId, setSearchParams]
  );

  const comparisonMode = inferComparisonMode(leftBuild, rightBuild);

  return (
    <div className="page page--compare">
      <Panel variant="primary">
        <SectionHeader
          title="Compare builds"
          subtitle="Compare succeeded builds across time, windows, and universes without manually typing identifiers."
        />

        {comparableBuilds.length < 2 && !buildRunsLoading ? (
          <div className="state-note state-note--error">
            At least two succeeded builds are required before comparison becomes available.
          </div>
        ) : null}

        <form className="query-form query-form--inline" onSubmit={handleCompare}>
          <label className="field">
            <span className="field__label">Base build</span>
            <select
              className="field__control mono"
              value={leftId}
              onChange={(e) => setLeftId(e.target.value)}
              disabled={loading || buildRunsLoading || comparableBuilds.length < 2}
            >
              {comparableBuilds.map((buildRun) => (
                <option key={buildRun.id} value={buildRun.id}>
                  {formatBuildOption(buildRun)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Comparison build</span>
            <select
              className="field__control mono"
              value={rightId}
              onChange={(e) => setRightId(e.target.value)}
              disabled={loading || buildRunsLoading || comparableBuilds.length < 2}
            >
              {comparableBuilds.map((buildRun) => (
                <option key={buildRun.id} value={buildRun.id}>
                  {formatBuildOption(buildRun)}
                </option>
              ))}
            </select>
          </label>

          <div className="query-form__action query-form__action--stack">
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                setLeftId(rightId);
                setRightId(leftId);
              }}
              disabled={loading || !leftId || !rightId || comparableBuilds.length < 2}
            >
              Swap
            </button>

            <button
              type="submit"
              className="button button--primary"
              disabled={loading || !leftId || !rightId || leftId === rightId || comparableBuilds.length < 2}
            >
              {loading ? 'Comparing…' : 'Compare'}
            </button>
          </div>
        </form>

        {leftId && rightId && leftId === rightId ? (
          <div className="state-note state-note--error">
            Select two different builds to compare.
          </div>
        ) : null}
      </Panel>

      {error ? (
        <Panel variant="primary">
          <div className="state-note state-note--error">{error}</div>
        </Panel>
      ) : null}

      {result ? <CompareResult data={result} /> : null}

      {leftBuild && rightBuild ? (
        <Panel variant="utility">
          <SectionHeader
            title="Comparison setup"
            subtitle="Only succeeded builds are surfaced here, so comparison starts from valid research artifacts instead of queue state."
          />

          <div className="compare-mode-grid">
            <article className={`compare-mode-card${comparisonMode === 'time_vs_time' ? ' compare-mode-card--active' : ''}`}>
              <div className="compare-mode-card__title">Time vs time</div>
              <div className="compare-mode-card__copy">Same universe and window, different dates.</div>
            </article>

            <article className={`compare-mode-card${comparisonMode === 'window_vs_window' ? ' compare-mode-card--active' : ''}`}>
              <div className="compare-mode-card__title">Window vs window</div>
              <div className="compare-mode-card__copy">Same date and universe, different lookback windows.</div>
            </article>

            <article className={`compare-mode-card${comparisonMode === 'universe_vs_universe' ? ' compare-mode-card--active' : ''}`}>
              <div className="compare-mode-card__title">Universe vs universe</div>
              <div className="compare-mode-card__copy">Same date and window, different resolved research scope.</div>
            </article>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function formatBuildOption(buildRun: BuildRunListItem): string {
  return `${buildRun.universeId} · ${formatDateOnly(buildRun.asOfDate)} · ${buildRun.windowDays}d · ${buildRun.id.slice(0, 8)}`;
}

function inferComparisonMode(
  left: BuildRunListItem | null,
  right: BuildRunListItem | null
): 'time_vs_time' | 'window_vs_window' | 'universe_vs_universe' | 'mixed' {
  if (!left || !right) {
    return 'mixed';
  }

  if (left.universeId === right.universeId && left.windowDays === right.windowDays && left.asOfDate !== right.asOfDate) {
    return 'time_vs_time';
  }

  if (left.universeId === right.universeId && left.asOfDate === right.asOfDate && left.windowDays !== right.windowDays) {
    return 'window_vs_window';
  }

  if (left.asOfDate === right.asOfDate && left.windowDays === right.windowDays && left.universeId !== right.universeId) {
    return 'universe_vs_universe';
  }

  return 'mixed';
}

function CompareResult({ data }: { data: CompareBuildsResponse }) {
  return (
    <Panel variant="primary">
      <SectionHeader title="Drift analysis" />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">Common symbols</div>
          <div className="stat-card__value">{data.commonSymbols.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Left date</div>
          <div className="stat-card__value mono">{data.left.asOfDate}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Right date</div>
          <div className="stat-card__value mono">{data.right.asOfDate}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Drift pairs shown</div>
          <div className="stat-card__value">{data.topDriftPairs.length}</div>
        </div>
      </div>

      {data.topDriftPairs.length > 0 ? (
        <div className="rank-list">
          {data.topDriftPairs.map((entry, i) => {
            const absDelta = Math.abs(entry.delta);
            const variant =
              absDelta > 0.3 ? 'negative' : absDelta > 0.1 ? 'neutral' : 'positive';

            return (
              <div key={`${entry.left}-${entry.right}`} className="rank-list__item">
                <span className="rank-list__index">{i + 1}</span>
                <div className="rank-list__body">
                  <div className="rank-list__pair">
                    <span className="mono">{entry.left}</span>
                    <span className="rank-list__pair-sep">↔</span>
                    <span className="mono">{entry.right}</span>
                  </div>
                  <div className="rank-list__meta">
                    Left: {entry.leftScore.toFixed(4)} · Right: {entry.rightScore.toFixed(4)}
                  </div>
                </div>
                <span className={`score-pill score-pill--${variant}`}>
                  Δ {entry.delta > 0 ? '+' : ''}{entry.delta.toFixed(4)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="state-note">No significant drift detected.</div>
      )}
    </Panel>
  );
}
