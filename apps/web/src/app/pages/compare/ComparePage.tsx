// apps/web/src/app/pages/compare/ComparePage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import BoundaryNote from '../../../components/ui/BoundaryNote';
import Panel from '../../../components/ui/Panel';
import SectionHeader from '../../../components/ui/SectionHeader';
import { compareBuilds } from '../../../features/builds/api';
import { useCatalogData } from '../../../features/catalog/hooks';
import { useBuildRunsData } from '../../../features/builds/hooks';
import { formatDateOnly, formatInteger } from '../../../lib/format';
import { formatLookbackLabel } from '../../../lib/snapshot-language';
import type { BuildRunListItem, CompareBuildsResponse } from '../../../types/api';

export default function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [leftId, setLeftId] = useState(searchParams.get('left') ?? '');
  const [rightId, setRightId] = useState(searchParams.get('right') ?? '');
  const [result, setResult] = useState<CompareBuildsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { universes } = useCatalogData();
  const { buildRuns, loading: buildRunsLoading } = useBuildRunsData(5000);
  const comparableBuilds = useMemo(
    () => buildRuns.filter((item) => item.status === 'succeeded'),
    [buildRuns]
  );
  const universeLabelById = useMemo(
    () => Object.fromEntries(universes.map((item) => [item.id, item.name])),
    [universes]
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
  const comparisonModeCopy = describeComparisonMode(comparisonMode);

  return (
    <div className="page page--compare">
      <section className="workspace-hero">
        <div className="workspace-hero__copy">
          <h1 className="workspace-hero__title">What changed between two snapshots?</h1>
          <p className="workspace-hero__description">
            Use this page after you already have two finished snapshots and the real question is change.
          </p>
          <BoundaryNote variant="accent">
            Open comparison only. You do not create anything here.
          </BoundaryNote>
          <div className="workspace-hero__actions">
            <Link to="/builds" className="button button--secondary">
              Browse snapshots
            </Link>
            <Link to="/builds/new" className="button button--ghost">
              Create snapshot
            </Link>
          </div>
        </div>

        <div className="workspace-hero__stats">
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{formatInteger(comparableBuilds.length)}</div>
            <div className="workspace-hero__stat-label">Ready snapshots</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{leftBuild ? formatDateOnly(leftBuild.asOfDate) : '—'}</div>
            <div className="workspace-hero__stat-label">Left date</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{rightBuild ? formatDateOnly(rightBuild.asOfDate) : '—'}</div>
            <div className="workspace-hero__stat-label">Right date</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value">{comparisonModeCopy.label}</div>
            <div className="workspace-hero__stat-label">Comparison type</div>
          </article>
        </div>
      </section>

      <div className="workspace-layout">
        <div className="workspace-layout__main">
          <Panel variant="primary">
            <SectionHeader
              title="Choose two snapshots"
              subtitle="Pick two finished reads. Start with the same basket when you want the cleanest time comparison."
            />

            {comparableBuilds.length < 2 && !buildRunsLoading ? (
              <div className="state-note state-note--error">
                At least two ready snapshots are required before comparison becomes available.
              </div>
            ) : null}

            <form className="compare-builder" onSubmit={handleCompare}>
              <div className="compare-builder__selectors">
                <label className="field">
                  <span className="field__label">Left snapshot</span>
                  <select
                    className="field__control mono"
                    value={leftId}
                    onChange={(e) => setLeftId(e.target.value)}
                    disabled={loading || buildRunsLoading || comparableBuilds.length < 2}
                  >
                    {comparableBuilds.map((buildRun) => (
                      <option key={buildRun.id} value={buildRun.id}>
                        {formatCompareOptionLabel(buildRun, universeLabelById[buildRun.universeId] ?? buildRun.universeId)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="field__label">Right snapshot</span>
                  <select
                    className="field__control mono"
                    value={rightId}
                    onChange={(e) => setRightId(e.target.value)}
                    disabled={loading || buildRunsLoading || comparableBuilds.length < 2}
                  >
                    {comparableBuilds.map((buildRun) => (
                      <option key={buildRun.id} value={buildRun.id}>
                        {formatCompareOptionLabel(buildRun, universeLabelById[buildRun.universeId] ?? buildRun.universeId)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="compare-builder__actions">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => {
                    setLeftId(rightId);
                    setRightId(leftId);
                  }}
                  disabled={loading || !leftId || !rightId || comparableBuilds.length < 2}
                >
                  Swap sides
                </button>

                <button
                  type="submit"
                  className="button button--primary"
                  disabled={loading || !leftId || !rightId || leftId === rightId || comparableBuilds.length < 2}
                >
                  {loading ? 'Comparing…' : 'Compare snapshots'}
                </button>
              </div>
            </form>

            {leftBuild && rightBuild ? (
              <div className="compare-selection-grid">
                <article className="compare-selection-card">
                  <div className="compare-selection-card__label">Left snapshot</div>
                  <div className="compare-selection-card__title">
                    {universeLabelById[leftBuild.universeId] ?? leftBuild.universeId}
                  </div>
                  <div className="compare-selection-card__meta">
                    {formatDateOnly(leftBuild.asOfDate)} · {formatLookbackLabel(leftBuild.windowDays)}
                  </div>
                </article>

                <article className="compare-selection-card">
                  <div className="compare-selection-card__label">Right snapshot</div>
                  <div className="compare-selection-card__title">
                    {universeLabelById[rightBuild.universeId] ?? rightBuild.universeId}
                  </div>
                  <div className="compare-selection-card__meta">
                    {formatDateOnly(rightBuild.asOfDate)} · {formatLookbackLabel(rightBuild.windowDays)}
                  </div>
                </article>
              </div>
            ) : null}

            <div className="field__hint">
              Use the same basket for a time comparison, the same date for a lookback comparison, or the same date and lookback for a basket comparison.
            </div>

            {leftId && rightId && leftId === rightId ? (
              <div className="state-note state-note--error">
                Select two different snapshots to compare.
              </div>
            ) : null}
          </Panel>

          {error ? (
            <Panel variant="primary">
              <div className="state-note state-note--error">{error}</div>
            </Panel>
          ) : null}

          {result ? (
            <CompareResult
              data={result}
              leftBuild={leftBuild}
              rightBuild={rightBuild}
              universeLabelById={universeLabelById}
            />
          ) : null}
        </div>

        <div className="workspace-layout__side">
          <Panel variant="utility">
            <SectionHeader
              title="How to use this page"
              subtitle="Compare after single-snapshot reading, not before."
            />

            <div className="workspace-note-list">
              <div className="workspace-note-list__item">Open one snapshot first when the question is about one basket on one date.</div>
              <div className="workspace-note-list__item">Use comparison only when you really need to see what changed between two finished reads.</div>
              <div className="workspace-note-list__item">If you want pair follow-up instead of broad drift, move to Relationships after you compare.</div>
            </div>
          </Panel>

          {leftBuild && rightBuild ? (
            <Panel variant="utility">
              <SectionHeader
                title="What this comparison is testing"
                subtitle={comparisonModeCopy.copy}
              />

              <div className="compare-mode-grid compare-mode-grid--stack">
                <article className={`compare-mode-card${comparisonMode === 'time_vs_time' ? ' compare-mode-card--active' : ''}`}>
                  <div className="compare-mode-card__title">Time change</div>
                  <div className="compare-mode-card__copy">Same basket and lookback, different snapshot dates.</div>
                </article>

                <article className={`compare-mode-card${comparisonMode === 'window_vs_window' ? ' compare-mode-card--active' : ''}`}>
                  <div className="compare-mode-card__title">Lookback change</div>
                  <div className="compare-mode-card__copy">Same basket and date, different lookback lengths.</div>
                </article>

                <article className={`compare-mode-card${comparisonMode === 'universe_vs_universe' ? ' compare-mode-card--active' : ''}`}>
                  <div className="compare-mode-card__title">Basket change</div>
                  <div className="compare-mode-card__copy">Same date and lookback, different baskets.</div>
                </article>
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
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

function CompareResult({
  data,
  leftBuild,
  rightBuild,
  universeLabelById
}: {
  data: CompareBuildsResponse;
  leftBuild: BuildRunListItem | null;
  rightBuild: BuildRunListItem | null;
  universeLabelById: Record<string, string>;
}) {
  const leftLabel = leftBuild ? universeLabelById[leftBuild.universeId] ?? leftBuild.universeId : 'Left snapshot';
  const rightLabel = rightBuild ? universeLabelById[rightBuild.universeId] ?? rightBuild.universeId : 'Right snapshot';

  return (
    <Panel variant="primary">
      <SectionHeader
        title="What changed"
        subtitle={`${leftLabel} versus ${rightLabel}. These are the relationships with the biggest score changes between the two snapshots.`}
      />

      <div className="plain-summary">
        {data.topDriftPairs.length === 0
          ? 'No material relationship change was surfaced by this comparison — overlapping names look stable across both snapshots.'
          : `${data.topDriftPairs.length} relationship${data.topDriftPairs.length === 1 ? '' : 's'} shifted noticeably between these two snapshots.`
        }
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">Common names</div>
          <div className="stat-card__value">{data.commonSymbols.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Left date</div>
          <div className="stat-card__value mono">{formatDateOnly(data.left.asOfDate)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Right date</div>
          <div className="stat-card__value mono">{formatDateOnly(data.right.asOfDate)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Changes shown</div>
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
                    {absDelta > 0.3
                      ? 'A large shift — this pair’s relationship changed substantially between snapshots.'
                      : absDelta > 0.1
                        ? 'A moderate drift — worth watching but not dramatic.'
                        : 'A minor change — this pair stayed relatively stable.'}
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
        <div className="compare-empty-state">
          <div className="compare-empty-state__title">No strong drift stood out here.</div>
          <div className="compare-empty-state__copy">
            The overlapping names look fairly stable across these two snapshots. Try a wider time gap, a different lookback, or move into Relationships for a more targeted follow-up.
          </div>
          <div className="next-steps">
            <Link to="/builds/new" className="button button--secondary">Create snapshot</Link>
            <Link to="/divergence" className="button button--ghost">Open Relationships</Link>
          </div>
        </div>
      )}
    </Panel>
  );
}

function describeComparisonMode(
  mode: 'time_vs_time' | 'window_vs_window' | 'universe_vs_universe' | 'mixed'
) {
  switch (mode) {
    case 'time_vs_time':
      return {
        label: 'Time change',
        copy: 'You are holding basket and lookback steady while asking what changed across dates.'
      };
    case 'window_vs_window':
      return {
        label: 'Lookback change',
        copy: 'You are holding basket and date steady while asking what changes with the lookback horizon.'
      };
    case 'universe_vs_universe':
      return {
        label: 'Basket change',
        copy: 'You are holding date and lookback steady while asking how two baskets differ.'
      };
    default:
      return {
        label: 'Mixed setup',
        copy: 'This comparison changes more than one dimension at once, so interpretation will be broader.'
      };
  }
}

function formatCompareOptionLabel(buildRun: BuildRunListItem, universeLabel: string): string {
  return `${universeLabel} · ${formatDateOnly(buildRun.asOfDate)} · ${formatLookbackLabel(buildRun.windowDays)}`;
}
