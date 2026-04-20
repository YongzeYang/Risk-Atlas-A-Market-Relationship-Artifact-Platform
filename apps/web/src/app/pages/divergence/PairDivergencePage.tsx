import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ActiveAnalysisRunPanel, RecentAnalysisRunsPanel } from '../../../components/analysis/AnalysisRunPanels';
import BoundaryNote from '../../../components/ui/BoundaryNote';
import Panel from '../../../components/ui/Panel';
import Modal from '../../../components/ui/Modal';
import ResearchDetails from '../../../components/ui/ResearchDetails';
import SectionHeader from '../../../components/ui/SectionHeader';
import WorkflowStrip from '../../../components/ui/WorkflowStrip';
import { createPairDivergenceAnalysisRun } from '../../../features/builds/api';
import {
  useAnalysisRunData,
  useAnalysisRunListData,
  useBuildDetailData,
  useBuildRunsData,
  useInviteCode
} from '../../../features/builds/hooks';
import { buildAnalysisWorkflowItems } from '../../../lib/analysis-workflow';
import { formatDateOnly, formatInteger, formatScore } from '../../../lib/format';
import { formatLookbackLabel, formatSnapshotOptionLabel } from '../../../lib/snapshot-language';
import type {
  AnalysisRunDetailResponse,
  AnalysisRunListItem,
  BuildRunDetailResponse,
  BuildRunListItem,
  PairDivergenceCandidate,
  PairDivergenceResponse
} from '../../../types/api';

const DEFAULT_RECENT_WINDOW_DAYS = '20';
const DEFAULT_LIMIT = '50';
const DEFAULT_MIN_LONG_CORR_ABS = '0.35';
const DEFAULT_MIN_CORR_DELTA_ABS = '0.12';

export default function PairDivergencePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [buildId, setBuildId] = useState(searchParams.get('build') ?? '');
  const [runId, setRunId] = useState(searchParams.get('run') ?? '');
  const [recentWindowDays, setRecentWindowDays] = useState(
    searchParams.get('recentWindowDays') ?? DEFAULT_RECENT_WINDOW_DAYS
  );
  const [limit, setLimit] = useState(searchParams.get('limit') ?? DEFAULT_LIMIT);
  const [minLongCorrAbs, setMinLongCorrAbs] = useState(
    searchParams.get('minLongCorrAbs') ?? DEFAULT_MIN_LONG_CORR_ABS
  );
  const [minCorrDeltaAbs, setMinCorrDeltaAbs] = useState(
    searchParams.get('minCorrDeltaAbs') ?? DEFAULT_MIN_CORR_DELTA_ABS
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { inviteCode, setInviteCode } = useInviteCode();
  const { buildRuns, loading: buildRunsLoading } = useBuildRunsData(5000);
  const {
    detail,
    loading: previewLoading,
    error: previewError
  } = useBuildDetailData(previewOpen ? buildId || undefined : undefined, 5000);
  const { run, loading: runLoading, error: runError } = useAnalysisRunData(runId || undefined, 1500);
  const { runs: recentRuns, loading: recentRunsLoading } = useAnalysisRunListData(
    'pair_divergence',
    buildId || undefined,
    4000
  );

  const comparableBuilds = useMemo(
    () => buildRuns.filter((item) => item.status === 'succeeded'),
    [buildRuns]
  );

  useEffect(() => {
    if (comparableBuilds.length === 0 || buildId || (runId && !run && !runError)) {
      return;
    }

    const queryBuild = searchParams.get('build') ?? '';
    const fallbackBuildId = comparableBuilds[0]?.id ?? '';
    const nextBuildId = comparableBuilds.some((item) => item.id === queryBuild)
      ? queryBuild
      : fallbackBuildId;

    if (nextBuildId) {
      setBuildId(nextBuildId);
    }
  }, [buildId, comparableBuilds, run, runError, runId, searchParams]);

  useEffect(() => {
    if (!run || run.kind !== 'pair_divergence') {
      return;
    }

    setBuildId(run.buildRunId);
    setRecentWindowDays(String(run.request.recentWindowDays));
    setLimit(String(run.request.limit));
    setMinLongCorrAbs(String(run.request.minLongCorrAbs));
    setMinCorrDeltaAbs(String(run.request.minCorrDeltaAbs));
  }, [run]);

  const selectedBuild = useMemo(
    () => comparableBuilds.find((item) => item.id === buildId) ?? null,
    [buildId, comparableBuilds]
  );

  const activeResult = run?.kind === 'pair_divergence' ? run.result : null;
  const workflowItems = buildAnalysisWorkflowItems('relationships', {
    groupsTo: buildId ? `/structure?build=${buildId}` : '/structure',
    compareTo: buildId ? `/compare?left=${buildId}` : '/compare',
    relationshipsTo: buildId ? `/divergence?build=${buildId}` : '/divergence',
    spilloverTo: buildId ? `/exposure?build=${buildId}` : '/exposure'
  });

  const persistQuery = useCallback(
    (next: {
      buildId: string;
      runId?: string;
      recentWindowDays: number | string;
      limit: number | string;
      minLongCorrAbs: number | string;
      minCorrDeltaAbs: number | string;
    }) => {
      const params = new URLSearchParams();
      params.set('build', next.buildId);
      params.set('recentWindowDays', String(next.recentWindowDays));
      params.set('limit', String(next.limit));
      params.set('minLongCorrAbs', String(next.minLongCorrAbs));
      params.set('minCorrDeltaAbs', String(next.minCorrDeltaAbs));
      if (next.runId) {
        params.set('run', next.runId);
      }
      setSearchParams(params);
    },
    [setSearchParams]
  );

  const adoptRun = useCallback(
    (nextRun: AnalysisRunDetailResponse | AnalysisRunListItem) => {
      if (nextRun.kind !== 'pair_divergence') {
        return;
      }

      setRunId(nextRun.id);
      setBuildId(nextRun.buildRunId);
      setRecentWindowDays(String(nextRun.request.recentWindowDays));
      setLimit(String(nextRun.request.limit));
      setMinLongCorrAbs(String(nextRun.request.minLongCorrAbs));
      setMinCorrDeltaAbs(String(nextRun.request.minCorrDeltaAbs));

      persistQuery({
        buildId: nextRun.buildRunId,
        runId: nextRun.id,
        recentWindowDays: nextRun.request.recentWindowDays,
        limit: nextRun.request.limit,
        minLongCorrAbs: nextRun.request.minLongCorrAbs,
        minCorrDeltaAbs: nextRun.request.minCorrDeltaAbs
      });
    },
    [persistQuery]
  );

  const handleAnalyze = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (!buildId) {
        setError('Select a ready snapshot before preparing relationship analysis.');
        return;
      }

      if (!inviteCode) {
        setError('Invite code is required before preparing relationship analysis.');
        return;
      }

      const parsedRecentWindowDays = Number(recentWindowDays);
      const parsedLimit = Number(limit);
      const parsedMinLongCorrAbs = Number(minLongCorrAbs);
      const parsedMinCorrDeltaAbs = Number(minCorrDeltaAbs);

      if (
        !Number.isFinite(parsedRecentWindowDays) ||
        !Number.isFinite(parsedLimit) ||
        !Number.isFinite(parsedMinLongCorrAbs) ||
        !Number.isFinite(parsedMinCorrDeltaAbs)
      ) {
        setError('All divergence controls must have valid numeric values.');
        return;
      }

      setSubmitting(true);
      setError(null);

      try {
        const queued = await createPairDivergenceAnalysisRun(
          {
            buildRunId: buildId,
            recentWindowDays: parsedRecentWindowDays,
            limit: parsedLimit,
            minLongCorrAbs: parsedMinLongCorrAbs,
            minCorrDeltaAbs: parsedMinCorrDeltaAbs
          },
          inviteCode
        );

        adoptRun(queued);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to prepare relationship analysis.');
      } finally {
        setSubmitting(false);
      }
    },
    [
      adoptRun,
      buildId,
      inviteCode,
      limit,
      minCorrDeltaAbs,
      minLongCorrAbs,
      recentWindowDays
    ]
  );

  return (
    <div className="page page--divergence">
      <section className="workspace-hero workspace-hero--divergence">
        <div className="workspace-hero__copy">
          <div className="workspace-hero__intro">
            <div className="workspace-hero__lead">
              <div className="workspace-hero__eyebrow">Relationship drift</div>
              <h1 className="workspace-hero__title">Which pairs no longer behave the way the basket expects?</h1>
              <p className="workspace-hero__description">
                Scan for pairs whose fresh relationship is meaningfully stronger, weaker, or newly stretched relative to the anchor window.
              </p>
              <p className="workspace-hero__subline">
                Use this after the basket read or broad compare when you need the pairs behind the move.
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
                  <div className="workspace-hero__stat-value mono">{selectedBuild ? formatDateOnly(selectedBuild.asOfDate) : '—'}</div>
                  <div className="workspace-hero__stat-label">Anchor date</div>
                </article>
                <article className="workspace-hero__stat-card">
                  <div className="workspace-hero__stat-value mono">{selectedBuild ? formatLookbackLabel(selectedBuild.windowDays) : '—'}</div>
                  <div className="workspace-hero__stat-label">Anchor window</div>
                </article>
                <article className={`workspace-hero__stat-card${activeResult?.candidateCount ? ' workspace-hero__stat-card--highlight' : ''}`}>
                  <div className="workspace-hero__stat-value mono">{formatInteger(activeResult?.candidateCount ?? 0)}</div>
                  <div className="workspace-hero__stat-label">Pairs surfaced</div>
                </article>

                <div className="workspace-hero__stat-note">
                  <strong>Best setup:</strong> use a long anchor window you trust, then let the fresh window tell you where that intuition is slipping.
                </div>
              </div>
            </div>
          </div>

          <BoundaryNote className="workspace-hero__note" variant="accent">
            Relationship drift is a research prompt, not a trade trigger on its own.
          </BoundaryNote>
          <div className="workspace-hero__actions">
            <Link to="/compare" className="button button--secondary">
              What changed
            </Link>
            <Link to="/builds" className="button button--ghost">
              Browse snapshots
            </Link>
          </div>
        </div>
      </section>

      <WorkflowStrip
        title="Follow the question, not the tool list"
        subtitle="Use Compare for broad drift, then stay here only when the real follow-up is pair-level behaviour inside one saved snapshot."
        items={workflowItems}
        className="analysis-flow-strip"
        compact
      />

      <div className="workspace-layout">
        <div className="workspace-layout__main">
          <Panel variant="primary">
            <SectionHeader
              title="Prepare a saved relationship screen"
              subtitle="Queue a persisted drift read so you can reopen the same result later."
              action={
                <button
                  type="button"
                  className="button button--secondary button--sm"
                  onClick={() => setPreviewOpen(true)}
                  disabled={!selectedBuild}
                >
                  Preview snapshot
                </button>
              }
            />

            {comparableBuilds.length === 0 && !buildRunsLoading ? (
              <div className="state-note state-note--error">
                At least one ready snapshot is required before relationship analysis becomes available.
              </div>
            ) : null}

            <form className="query-form query-form--wide" onSubmit={handleAnalyze}>
              <label className="field">
                <span className="field__label">Snapshot</span>
                <select
                  className="field__control mono"
                  value={buildId}
                  onChange={(event) => {
                    setBuildId(event.target.value);
                    setRunId('');
                  }}
                  disabled={submitting || buildRunsLoading || comparableBuilds.length === 0}
                >
                  {comparableBuilds.map((buildRun) => (
                    <option key={buildRun.id} value={buildRun.id}>
                      {formatSnapshotOptionLabel(buildRun)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field__label">Fresh lookback</span>
                <input
                  className="field__control mono"
                  type="number"
                  min={10}
                  max={60}
                  step={1}
                  value={recentWindowDays}
                  onChange={(event) => setRecentWindowDays(event.target.value)}
                />
              </label>

              <label className="field">
                <span className="field__label">Invite code</span>
                <input
                  className="field__control mono"
                  type="text"
                  placeholder="Needed to prepare analysis"
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  autoComplete="off"
                  disabled={submitting}
                />
              </label>

              <div className="query-form__action query-form__action--stack">
                <button
                  type="submit"
                  className="button button--primary"
                  disabled={submitting || !buildId || !inviteCode || comparableBuilds.length === 0}
                >
                  {submitting ? 'Preparing…' : 'Prepare relationships view'}
                </button>
              </div>
            </form>

            <ResearchDetails summary="Advanced settings">
              <div className="query-form query-form--wide">
                <label className="field">
                  <span className="field__label">Minimum anchor strength</span>
                  <input
                    className="field__control mono"
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={minLongCorrAbs}
                    onChange={(event) => setMinLongCorrAbs(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span className="field__label">Minimum change size</span>
                  <input
                    className="field__control mono"
                    type="number"
                    min={0}
                    max={2}
                    step={0.01}
                    value={minCorrDeltaAbs}
                    onChange={(event) => setMinCorrDeltaAbs(event.target.value)}
                  />
                </label>

                <label className="field">
                  <span className="field__label">Result limit</span>
                  <select
                    className="field__control mono"
                    value={limit}
                    onChange={(event) => setLimit(event.target.value)}
                  >
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                  </select>
                </label>
              </div>
            </ResearchDetails>
          </Panel>

          <Panel variant="primary">
            <SectionHeader
              title="Latest relationship screen"
              subtitle="Saved results reopen cleanly, so you can return without rerunning the scan."
            />
            <ActiveAnalysisRunPanel
              run={run}
              loading={runLoading}
              idleTitle="No current result"
              idleDescription="Prepare one analysis above or reopen a saved analysis from the side rail."
              formatSummary={formatDivergenceRunSummary}
            />
            {runError ? <div className="state-note state-note--error">{runError}</div> : null}
            {error ? <div className="state-note state-note--error">{error}</div> : null}
          </Panel>

          {activeResult ? <PairDivergenceResult data={activeResult} /> : null}
        </div>

        <div className="workspace-layout__side">
          <Panel variant="utility">
            <SectionHeader
              title="Saved relationship screens"
              subtitle="Reopen finished results without rerunning the worker."
            />
            <RecentAnalysisRunsPanel
              runs={recentRuns}
              loading={recentRunsLoading}
              activeRunId={runId}
              emptyCopy={
                buildId
                  ? 'No saved analyses yet for the selected snapshot.'
                  : 'Select a snapshot to load saved analyses.'
              }
              formatSummary={formatDivergenceRunSummary}
              onSelect={(nextRunId) => {
                const next = recentRuns.find((item) => item.id === nextRunId);
                if (next) {
                  adoptRun(next);
                }
              }}
            />
          </Panel>

          <Panel variant="utility">
            <SectionHeader
              title="How to read the list"
              subtitle="Treat these pairs as a shortlist for inspection, not a thesis by themselves."
            />

            <div className="workspace-note-list">
              <div className="workspace-note-list__item">Start with the largest deltas, then check whether the fresh window is genuinely breaking the old pattern.</div>
              <div className="workspace-note-list__item">Use return gaps and spread z-scores as context, not as standalone rules.</div>
              <div className="workspace-note-list__item">Use sector labels to separate local cracks from broader cross-sector shifts.</div>
            </div>
          </Panel>
        </div>
      </div>

      <Modal
        open={previewOpen}
        title="Run preview"
        subtitle="Use this to judge scope before you queue the saved relationship screen."
        onClose={() => setPreviewOpen(false)}
      >
        <DivergencePreview
          detail={detail}
          loading={previewLoading}
          error={previewError}
          selectedBuild={selectedBuild}
          recentWindowDays={recentWindowDays}
          limit={limit}
          minLongCorrAbs={minLongCorrAbs}
          minCorrDeltaAbs={minCorrDeltaAbs}
        />
      </Modal>
    </div>
  );
}

function DivergencePreview({
  detail,
  loading,
  error,
  selectedBuild,
  recentWindowDays,
  limit,
  minLongCorrAbs,
  minCorrDeltaAbs
}: {
  detail: BuildRunDetailResponse | null;
  loading: boolean;
  error: string | null;
  selectedBuild: BuildRunListItem | null;
  recentWindowDays: string;
  limit: string;
  minLongCorrAbs: string;
  minCorrDeltaAbs: string;
}) {
  if (!selectedBuild) {
    return <div className="state-note">Select one ready snapshot to preview this screen.</div>;
  }

  if (loading && !detail) {
    return <div className="state-note">Loading snapshot preview…</div>;
  }

  if (error) {
    return <div className="state-note state-note--error">{error}</div>;
  }

  const symbolCount = detail?.symbolOrder.length ?? 0;
  const pairScanCount = symbolCount > 1 ? (symbolCount * (symbolCount - 1)) / 2 : 0;
  const topPairs = detail?.topPairs.slice(0, 4) ?? [];

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">Snapshot scope</div>
          <div className="stat-card__value mono">{selectedBuild.universeId}</div>
          <div className="stat-card__helper">{formatDateOnly(selectedBuild.asOfDate)} · {formatLookbackLabel(selectedBuild.windowDays)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Basket size</div>
          <div className="stat-card__value mono">{formatInteger(symbolCount)}</div>
          <div className="stat-card__helper">Stored snapshot size</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Pair scan load</div>
          <div className="stat-card__value mono">{formatInteger(pairScanCount)}</div>
          <div className="stat-card__helper">$n(n-1)/2$ candidate pairs</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Threshold pack</div>
          <div className="stat-card__value mono">{recentWindowDays}d / {limit}</div>
          <div className="stat-card__helper">|long| ≥ {minLongCorrAbs} · |delta| ≥ {minCorrDeltaAbs}</div>
        </div>
      </div>

      <div className="filter-summary-row" style={{ marginTop: '1rem' }}>
        <span className="filter-summary-row__item">The worker will reuse the stored long-window matrix and only recompute the short-window layer.</span>
        <span className="filter-summary-row__item">The queued result persists under a run id, so you can leave and reopen it later.</span>
      </div>

      {topPairs.length > 0 ? (
        <div className="rank-list" style={{ marginTop: '1rem' }}>
          {topPairs.map((pair, index) => (
            <article key={`${pair.left}-${pair.right}`} className={`rank-list__item${index === 0 ? ' rank-list__item--top' : ''}`}>
              <span className="rank-list__index">{index + 1}</span>
              <div className="rank-list__body">
                <div className="rank-list__pair">
                  <span className="mono">{pair.left}</span>
                  <span className="rank-list__pair-sep">↔</span>
                  <span className="mono">{pair.right}</span>
                </div>
                <div className="rank-list__meta">Stored anchor relationship from the snapshot preview.</div>
              </div>
              <span className="score-pill score-pill--neutral">{formatScore(pair.score, 3)}</span>
            </article>
          ))}
        </div>
      ) : null}

      {detail?.symbolOrder.length ? (
        <div className="coverage-token-list" style={{ marginTop: '1rem' }}>
          {detail.symbolOrder.slice(0, 10).map((symbol) => (
            <span key={symbol} className="coverage-token mono">
              {symbol}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}

function PairDivergenceResult({ data }: { data: PairDivergenceResponse }) {
  const strongest = data.candidates[0] ?? null;
  const sameSectorCount = data.candidates.filter((candidate) => candidate.sameSector).length;

  return (
    <Panel variant="primary">
      <SectionHeader
        title="Pairs that broke, tightened, or stretched"
        subtitle="Ranked first by relationship change, then by the fresh return gap and spread dislocation around it."
      />

      <div className="plain-summary">
        {data.candidateCount} relationship{data.candidateCount === 1 ? '' : 's'} stood out in this scan.{' '}
        {strongest
          ? `The top candidate is ${strongest.left} ↔ ${strongest.right}, where the recent relationship is ${strongest.corrDelta > 0 ? 'stronger' : 'weaker'} than the longer read.`
          : ''}
        {sameSectorCount > data.candidates.length * 0.5
          ? ' Most changes here are same-sector rather than cross-sector.'
          : data.candidates.length > 0
            ? ' Most of the largest changes here are cross-sector rather than inside one sector.'
            : ''}
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">Pairs surfaced</div>
          <div className="stat-card__value mono">{formatInteger(data.candidateCount)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Fresh window</div>
          <div className="stat-card__value mono">{data.recentWindowDays}d</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Same-sector share</div>
          <div className="stat-card__value mono">
            {data.candidates.length > 0
              ? `${Math.round((sameSectorCount / data.candidates.length) * 100)}%`
              : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Lead pair</div>
          <div className="stat-card__value">{strongest ? `${strongest.left} ↔ ${strongest.right}` : '—'}</div>
        </div>
      </div>

      <div className="filter-summary-row">
        <span className="filter-summary-row__item">Thresholds: |long corr| ≥ {formatScore(data.minLongCorrAbs, 2)} and |corr delta| ≥ {formatScore(data.minCorrDeltaAbs, 2)}.</span>
        <span className="filter-summary-row__item">Showing {formatInteger(data.candidates.length)} rows out of {formatInteger(data.candidateCount)} surfaced candidates.</span>
      </div>

      {data.candidates.length > 0 ? (
        <div className="rank-list">
          {data.candidates.map((candidate, index) => (
            <article
              key={`${candidate.left}-${candidate.right}`}
              className={`rank-list__item${index < 3 ? ' rank-list__item--top' : ''}`}
            >
              <span className="rank-list__index">{index + 1}</span>
              <div className="rank-list__body">
                <div className="rank-list__pair">
                  <span className="mono">{candidate.left}</span>
                  <span className="rank-list__pair-sep">↔</span>
                  <span className="mono">{candidate.right}</span>
                </div>
                <div className="rank-list__meta">
                  Long {formatScore(candidate.longWindowCorr, 3)} → Recent {formatScore(candidate.recentCorr, 3)}.{' '}
                  {candidate.corrDelta > 0
                    ? 'These names look more aligned in the fresher window than in the longer read.'
                    : 'These names used to move together more closely than they do now.'}
                </div>
                <div className="rank-list__meta">{formatSectorLine(candidate)}</div>
              </div>
              <span className={`score-pill ${scorePillClassName(candidate.corrDelta)}`}>
                Δ {candidate.corrDelta > 0 ? '+' : ''}{formatScore(candidate.corrDelta, 3)}
              </span>
            </article>
          ))}
        </div>
      ) : (
        <div className="state-note">No relationships matched the current thresholds.</div>
      )}
    </Panel>
  );
}

function formatPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

function formatNullableScore(value: number | null): string {
  return value === null ? '—' : formatScore(value, 2);
}

function formatSectorLine(candidate: PairDivergenceCandidate): string {
  const leftSector = candidate.leftSector ?? 'unclassified';
  const rightSector = candidate.rightSector ?? 'unclassified';
  const overlay = candidate.sameSector ? 'same-sector move' : 'cross-sector move';
  return `Sectors ${leftSector} vs ${rightSector} · ${overlay}`;
}

function formatDivergenceRunSummary(run: AnalysisRunListItem | AnalysisRunDetailResponse): string {
  if (run.kind !== 'pair_divergence') {
    return 'Unsupported run kind.';
  }

  return `${run.buildRunId.slice(0, 8)} · fresh ${run.request.recentWindowDays}d · limit ${run.request.limit} · anchor ≥ ${formatScore(run.request.minLongCorrAbs, 2)} · change ≥ ${formatScore(run.request.minCorrDeltaAbs, 2)}`;
}

function scorePillClassName(corrDelta: number): string {
  if (corrDelta >= 0.15) {
    return 'score-pill--positive';
  }

  if (corrDelta <= -0.15) {
    return 'score-pill--negative';
  }

  return 'score-pill--neutral';
}