// apps/web/src/app/pages/compare/ComparePage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import BoundaryNote from '../../../components/ui/BoundaryNote';
import Panel from '../../../components/ui/Panel';
import SectionHeader from '../../../components/ui/SectionHeader';
import WorkflowStrip from '../../../components/ui/WorkflowStrip';
import { compareBuilds } from '../../../features/builds/api';
import { useCatalogData } from '../../../features/catalog/hooks';
import { useBuildRunsData } from '../../../features/builds/hooks';
import { buildAnalysisWorkflowItems } from '../../../lib/analysis-workflow';
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
  const followUpBuild = rightBuild ?? leftBuild;
  const workflowItems = buildAnalysisWorkflowItems('compare', {
    groupsTo: followUpBuild ? `/structure?build=${followUpBuild.id}` : '/structure',
    compareTo: leftBuild && rightBuild ? `/compare?left=${leftBuild.id}&right=${rightBuild.id}` : '/compare',
    relationshipsTo: followUpBuild ? `/divergence?build=${followUpBuild.id}` : '/divergence',
    spilloverTo: followUpBuild ? `/exposure?build=${followUpBuild.id}` : '/exposure'
  });

  return (
    <div className="page page--compare">
      <section className="workspace-hero workspace-hero--compare">
        <div className="workspace-hero__copy">
          <div className="workspace-hero__intro">
            <div className="workspace-hero__lead">
              <div className="workspace-hero__eyebrow">Compare one dimension</div>
              <h1 className="workspace-hero__title">See what actually changed between two finished reads.</h1>
              <p className="workspace-hero__description">
                Hold basket, date, or lookback steady and inspect where the structure really drifted.
              </p>
              <p className="workspace-hero__subline">
                The cleanest compare changes one thing on purpose instead of changing everything at once.
              </p>
            </div>

            <div className="workspace-hero__summary">
              <div className="workspace-hero__summary-label">Quick read</div>
              <div className="workspace-hero__stats">
                <article className="workspace-hero__stat-card">
                  <div className="workspace-hero__stat-value mono">{formatInteger(comparableBuilds.length)}</div>
                  <div className="workspace-hero__stat-label">Finished reads</div>
                </article>
                <article className="workspace-hero__stat-card">
                  <div className="workspace-hero__stat-value mono">{leftBuild ? formatDateOnly(leftBuild.asOfDate) : '—'}</div>
                  <div className="workspace-hero__stat-label">Baseline date</div>
                </article>
                <article className="workspace-hero__stat-card">
                  <div className="workspace-hero__stat-value mono">{rightBuild ? formatDateOnly(rightBuild.asOfDate) : '—'}</div>
                  <div className="workspace-hero__stat-label">Challenger date</div>
                </article>
                <article className={`workspace-hero__stat-card${comparisonMode !== 'mixed' ? ' workspace-hero__stat-card--highlight' : ''}`}>
                  <div className="workspace-hero__stat-value">{comparisonModeCopy.label}</div>
                  <div className="workspace-hero__stat-label">Reading</div>
                </article>

                <div className="workspace-hero__stat-note">
                  <strong>Best setup:</strong> same basket and same lookback for time drift, or same basket and same date for horizon drift.
                </div>
              </div>
            </div>
          </div>

          <BoundaryNote className="workspace-hero__note" variant="accent">
            Use after two snapshots are already worth trusting. This page isolates change; it does not create a new read.
          </BoundaryNote>
          <div className="workspace-hero__actions">
            <Link to="/builds" className="button button--secondary">
              Browse snapshots
            </Link>
            <Link to="/divergence" className="button button--ghost">
              Open Relationships
            </Link>
          </div>
        </div>
      </section>

      <WorkflowStrip
        title="Follow the question, not the tool list"
        subtitle="Groups shows the single-snapshot shape first, compare checks broad drift, then Relationships and Spillover narrow the follow-up."
        items={workflowItems}
        className="analysis-flow-strip"
        compact
      />

      <div className="workspace-layout">
        <div className="workspace-layout__main">
          <Panel variant="primary">
            <SectionHeader
              title="Choose the baseline and the challenger"
              subtitle="Pick two finished reads. The cleanest compare keeps three things steady and changes one on purpose."
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
                  <div className="compare-selection-card__label">Baseline</div>
                  <div className="compare-selection-card__title">
                    {universeLabelById[leftBuild.universeId] ?? leftBuild.universeId}
                  </div>
                  <div className="compare-selection-card__meta">
                    {formatDateOnly(leftBuild.asOfDate)} · {formatLookbackLabel(leftBuild.windowDays)}
                  </div>
                </article>

                <article className="compare-selection-card">
                  <div className="compare-selection-card__label">Challenger</div>
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
              Same basket for time drift. Same basket and date for lookback drift. Same date and lookback for basket drift.
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
              title="Compare cleanly"
              subtitle="This page works best after you already understand each snapshot on its own."
            />

            <div className="workspace-note-list">
              <div className="workspace-note-list__item">Start from one snapshot when the question is still about one basket on one date.</div>
              <div className="workspace-note-list__item">Use compare only when the question is explicitly about change between two finished reads.</div>
              <div className="workspace-note-list__item">If the change looks local rather than broad, move into Relationships for the pair-level follow-up.</div>
            </div>
          </Panel>

          {leftBuild && rightBuild ? (
            <Panel variant="utility">
              <SectionHeader
                title="What this setup is isolating"
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
        title="Where the structure drifted"
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
          <div className="stat-card__label">Overlapping names</div>
          <div className="stat-card__value">{data.commonSymbols.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Baseline date</div>
          <div className="stat-card__value mono">{formatDateOnly(data.left.asOfDate)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Challenger date</div>
          <div className="stat-card__value mono">{formatDateOnly(data.right.asOfDate)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Pairs surfaced</div>
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
          <div className="compare-empty-state__title">No clear drift stood out here.</div>
          <div className="compare-empty-state__copy">
            The overlapping names look fairly stable across these two reads. Try a wider time gap, a different lookback, or move into Relationships for a tighter follow-up.
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
