import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ActiveAnalysisRunPanel, RecentAnalysisRunsPanel } from '../../../components/analysis/AnalysisRunPanels';
import BoundaryNote from '../../../components/ui/BoundaryNote';
import Panel from '../../../components/ui/Panel';
import Modal from '../../../components/ui/Modal';
import SectionHeader from '../../../components/ui/SectionHeader';
import WorkflowStrip from '../../../components/ui/WorkflowStrip';
import { createExposureAnalysisRun, getNeighbors } from '../../../features/builds/api';
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
  BuildRunListItem,
  ExposureResponse,
  NeighborsResponse
} from '../../../types/api';

const DEFAULT_K = '12';

export default function ExposurePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [buildId, setBuildId] = useState(searchParams.get('build') ?? '');
  const [runId, setRunId] = useState(searchParams.get('run') ?? '');
  const [symbol, setSymbol] = useState(searchParams.get('symbol') ?? '');
  const [k, setK] = useState(searchParams.get('k') ?? DEFAULT_K);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<NeighborsResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const { inviteCode, setInviteCode } = useInviteCode();

  const { buildRuns, loading: buildRunsLoading } = useBuildRunsData(5000);
  const comparableBuilds = useMemo(
    () => buildRuns.filter((item) => item.status === 'succeeded'),
    [buildRuns]
  );
  const { detail } = useBuildDetailData(buildId || undefined, 5000);
  const { run, loading: runLoading, error: runError } = useAnalysisRunData(runId || undefined, 1500);
  const { runs: recentRuns, loading: recentRunsLoading } = useAnalysisRunListData(
    'exposure',
    buildId || undefined,
    4000
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
    if (!detail || detail.symbolOrder.length === 0) {
      return;
    }

    if (!symbol || !detail.symbolOrder.includes(symbol)) {
      setSymbol(detail.symbolOrder[0] ?? '');
    }
  }, [detail, symbol]);

  useEffect(() => {
    if (!run || run.kind !== 'exposure') {
      return;
    }

    setBuildId(run.buildRunId);
    setSymbol(run.request.symbol);
    setK(String(run.request.k));
  }, [run]);

  useEffect(() => {
    const parsedK = Number(k);
    if (!previewOpen || !buildId || !symbol || !Number.isFinite(parsedK)) {
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setPreviewError(null);
    setPreviewLoading(true);

    void getNeighbors(buildId, {
      symbol,
      k: Math.max(1, Math.min(parsedK, 6))
    })
      .then((data) => {
        if (!cancelled) {
          setPreview(data);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(nextError instanceof Error ? nextError.message : 'Preview lookup failed.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [buildId, k, previewOpen, symbol]);

  const selectedBuild = useMemo(
    () => comparableBuilds.find((item) => item.id === buildId) ?? null,
    [buildId, comparableBuilds]
  );

  const activeResult = run?.kind === 'exposure' ? run.result : null;
  const workflowItems = buildAnalysisWorkflowItems('spillover', {
    groupsTo: buildId ? `/structure?build=${buildId}` : '/structure',
    compareTo: buildId ? `/compare?left=${buildId}` : '/compare',
    relationshipsTo: buildId ? `/divergence?build=${buildId}` : '/divergence',
    spilloverTo: buildId ? `/exposure?build=${buildId}` : '/exposure'
  });

  const persistQuery = useCallback(
    (next: {
      buildId: string;
      runId?: string;
      symbol: string;
      k: number | string;
    }) => {
      const params = new URLSearchParams();
      params.set('build', next.buildId);
      params.set('symbol', next.symbol);
      params.set('k', String(next.k));
      if (next.runId) {
        params.set('run', next.runId);
      }
      setSearchParams(params);
    },
    [setSearchParams]
  );

  const adoptRun = useCallback(
    (nextRun: AnalysisRunDetailResponse | AnalysisRunListItem) => {
      if (nextRun.kind !== 'exposure') {
        return;
      }

      setRunId(nextRun.id);
      setBuildId(nextRun.buildRunId);
      setSymbol(nextRun.request.symbol);
      setK(String(nextRun.request.k));

      persistQuery({
        buildId: nextRun.buildRunId,
        runId: nextRun.id,
        symbol: nextRun.request.symbol,
        k: nextRun.request.k
      });
    },
    [persistQuery]
  );

  const handleAnalyze = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (!buildId || !symbol) {
        setError('Select a ready snapshot and anchor name before preparing spillover analysis.');
        return;
      }

      if (!inviteCode) {
        setError('Invite code is required before preparing spillover analysis.');
        return;
      }

      const parsedK = Number(k);
      if (!Number.isFinite(parsedK)) {
        setError('Neighbor depth must be numeric.');
        return;
      }

      setSubmitting(true);
      setError(null);

      try {
        const queued = await createExposureAnalysisRun(
          {
            buildRunId: buildId,
            symbol,
            k: parsedK
          },
          inviteCode
        );

        adoptRun(queued);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to prepare spillover analysis.');
      } finally {
        setSubmitting(false);
      }
    },
    [adoptRun, buildId, inviteCode, k, symbol]
  );

  return (
    <div className="page page--exposure">
      <section className="workspace-hero workspace-hero--exposure">
        <div className="workspace-hero__copy">
          <div className="workspace-hero__intro">
            <div className="workspace-hero__lead">
              <div className="workspace-hero__eyebrow">Spillover map</div>
              <h1 className="workspace-hero__title">If one name slips, who usually echoes the move?</h1>
              <p className="workspace-hero__description">
                Start from one stock and trace the circle of names that tend to travel with it.
              </p>
              <p className="workspace-hero__subline">
                The point is not causality. It is to see whether the pressure stays local or bleeds wider into the basket.
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
                <article className={`workspace-hero__stat-card${symbol ? ' workspace-hero__stat-card--highlight' : ''}`}>
                  <div className="workspace-hero__stat-value mono">{symbol || '—'}</div>
                  <div className="workspace-hero__stat-label">Anchor name</div>
                </article>
                <article className="workspace-hero__stat-card">
                  <div className="workspace-hero__stat-value mono">{formatInteger(activeResult?.neighborCount ?? 0)}</div>
                  <div className="workspace-hero__stat-label">Names surfaced</div>
                </article>

                <div className="workspace-hero__stat-note">
                  <strong>Best setup:</strong> use this when you already know the anchor name and want to see whether its risk circle is narrow, broad, or sector-heavy.
                </div>
              </div>
            </div>
          </div>

          <BoundaryNote className="workspace-hero__note" variant="accent">
            Historical co-movement only. Use this page to map spillover shape, not to prove cause.
          </BoundaryNote>
          <div className="workspace-hero__actions">
            <Link to="/structure" className="button button--ghost">
              Open groups
            </Link>
            <Link to="/builds" className="button button--secondary">
              Browse snapshots
            </Link>
          </div>
        </div>
      </section>

      <WorkflowStrip
        title="Follow the question, not the tool list"
        subtitle="Groups shows the broad shape, Relationships isolates the broken pair, and Spillover traces the names around one chosen anchor."
        items={workflowItems}
        className="analysis-flow-strip"
        compact
      />

      <div className="workspace-layout">
        <div className="workspace-layout__main">
          <Panel variant="primary">
            <SectionHeader
              title="Prepare a saved spillover read"
              subtitle="Queue the read once, then reopen the same spillover result later."
              action={
                <button
                  type="button"
                  className="button button--secondary button--sm"
                  onClick={() => setPreviewOpen(true)}
                  disabled={!selectedBuild || !symbol}
                >
                  Preview circle
                </button>
              }
            />

            {comparableBuilds.length === 0 && !buildRunsLoading ? (
              <div className="state-note state-note--error">
                At least one ready snapshot is required before spillover analysis becomes available.
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
                <span className="field__label">Anchor name</span>
                <select
                  className="field__control mono"
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value)}
                  disabled={submitting || !detail || detail.symbolOrder.length === 0}
                >
                  {(detail?.symbolOrder ?? []).map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field__label">How many related names</span>
                <select
                  className="field__control mono"
                  value={k}
                  onChange={(event) => setK(event.target.value)}
                >
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="12">12</option>
                  <option value="15">15</option>
                  <option value="20">20</option>
                </select>
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
                  disabled={submitting || !buildId || !symbol || !inviteCode}
                >
                  {submitting ? 'Preparing…' : 'Prepare spillover view'}
                </button>
              </div>
            </form>
          </Panel>

          <Panel variant="primary">
            <SectionHeader
              title="Latest spillover read"
              subtitle="Saved results stay available after reload, so you can come back to the same circle later."
            />
            <ActiveAnalysisRunPanel
              run={run}
              loading={runLoading}
              idleTitle="No current result"
              idleDescription="Prepare one analysis above or reopen a saved analysis from the side rail."
              formatSummary={formatExposureRunSummary}
            />
            {runError ? <div className="state-note state-note--error">{runError}</div> : null}
            {error ? <div className="state-note state-note--error">{error}</div> : null}
          </Panel>

          {activeResult ? <ExposureResult data={activeResult} /> : null}
        </div>

        <div className="workspace-layout__side">
          <Panel variant="utility">
            <SectionHeader
              title="Saved spillover reads"
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
              formatSummary={formatExposureRunSummary}
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
              title="How to read the circle"
              subtitle="This page asks whether co-movement around one name is broad, narrow, and sector-concentrated."
            />

            <div className="workspace-note-list">
              <div className="workspace-note-list__item">Start with the anchor, then ask whether the surrounding circle is tight or diffuse.</div>
              <div className="workspace-note-list__item">Same-sector concentration helps separate local overlap from broader market structure.</div>
              <div className="workspace-note-list__item">This is a historical relationship map, not a guarantee of future contagion.</div>
            </div>
          </Panel>
        </div>
      </div>

      <Modal
        open={previewOpen}
        title="Run preview"
        subtitle="Preview the scope and a small live neighbor slice before you queue the saved spillover read."
        onClose={() => setPreviewOpen(false)}
      >
        <ExposurePreview
          selectedBuild={selectedBuild}
          symbol={symbol}
          k={k}
          universeSize={detail?.symbolOrder.length ?? 0}
          preview={preview}
          previewError={previewError}
          previewLoading={previewLoading}
        />
      </Modal>
    </div>
  );
}

function ExposurePreview({
  selectedBuild,
  symbol,
  k,
  universeSize,
  preview,
  previewError,
  previewLoading
}: {
  selectedBuild: BuildRunListItem | null;
  symbol: string;
  k: string;
  universeSize: number;
  preview: NeighborsResponse | null;
  previewError: string | null;
  previewLoading: boolean;
}) {
  if (!selectedBuild) {
    return <div className="state-note">Select one ready snapshot to preview this run.</div>;
  }

  if (previewLoading && !preview) {
    return <div className="state-note">Loading neighbor preview…</div>;
  }

  const averagePreviewScore =
    preview && preview.neighbors.length > 0
      ? preview.neighbors.reduce((sum, entry) => sum + entry.score, 0) / preview.neighbors.length
      : null;

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
          <div className="stat-card__value mono">{formatInteger(universeSize)}</div>
          <div className="stat-card__helper">Names available for the anchor picker</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Anchor / depth</div>
          <div className="stat-card__value mono">{symbol || '—'} / {k}</div>
          <div className="stat-card__helper">Queue request shape</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Preview avg score</div>
          <div className="stat-card__value mono">{averagePreviewScore === null ? '—' : formatScore(averagePreviewScore, 3)}</div>
          <div className="stat-card__helper">Open neighbor lookup preview</div>
        </div>
      </div>

      <div className="filter-summary-row" style={{ marginTop: '1rem' }}>
        <span className="filter-summary-row__item">The preview below is a fast open neighbor lookup, not the persisted analysis result.</span>
        <span className="filter-summary-row__item">The queued run adds sector aggregation, concentration, and strength-band summaries.</span>
      </div>

      {previewError ? <div className="state-note state-note--error" style={{ marginTop: '1rem' }}>{previewError}</div> : null}

      {preview?.neighbors.length ? (
        <div className="rank-list" style={{ marginTop: '1rem' }}>
          {preview.neighbors.map((entry, index) => (
            <article key={entry.symbol} className={`rank-list__item${index === 0 ? ' rank-list__item--top' : ''}`}>
              <span className="rank-list__index">{index + 1}</span>
              <div className="rank-list__body">
                <div className="rank-list__pair">
                  <span className="mono">{symbol}</span>
                  <span className="rank-list__pair-sep">→</span>
                  <span className="mono">{entry.symbol}</span>
                </div>
                <div className="rank-list__meta">Preview neighbor from the stored snapshot top-k lookup.</div>
              </div>
              <span className="score-pill score-pill--neutral">{formatScore(entry.score, 3)}</span>
            </article>
          ))}
        </div>
      ) : null}
    </>
  );
}

function ExposureResult({ data }: { data: ExposureResponse }) {
  return (
    <Panel variant="primary">
      <SectionHeader
        title="Where the move tends to spread"
        subtitle="The anchor name is shown with its related names, sector mix, and concentration in one read."
      />

      <div className="plain-summary">
        Risk around <span className="mono">{data.symbol}</span> looks{' '}
        {data.concentrationIndex > 0.5 ? 'concentrated in a small circle' : 'broad rather than concentrated in one corner of the basket'}.{' '}
        {data.sameSectorWeightShare > 0.5
          ? 'The related names lean heavily toward the same sector.'
          : 'The related names are spread across multiple sectors.'}
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">Anchor sector</div>
          <div className="stat-card__value">{data.anchorSector ?? 'unclassified'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Avg co-movement</div>
          <div className="stat-card__value mono">{formatScore(data.averageNeighborScore, 3)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Circle breadth</div>
          <div className="stat-card__value mono">{formatScore(data.concentrationIndex, 3)}</div>
          <div className="stat-card__helper">Lower values mean risk is spread across more names</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Same-sector weight</div>
          <div className="stat-card__value mono">{formatPercent(data.sameSectorWeightShare)}</div>
        </div>
      </div>

      <div className="workspace-layout" style={{ marginTop: '1.5rem' }}>
        <div className="workspace-layout__main">
          <SectionHeader
            title="Closest names"
            subtitle="Ranked by relationship score from the stored snapshot."
          />

          <div className="rank-list">
            {data.neighbors.map((entry, index) => (
              <article key={entry.symbol} className="rank-list__item">
                <span className="rank-list__index">{index + 1}</span>
                <div className="rank-list__body">
                  <div className="rank-list__pair">
                    <span className="mono">{entry.symbol}</span>
                  </div>
                  <div className="rank-list__meta">
                    {entry.sector ?? 'unclassified'} · {entry.strengthBand.replace('_', ' ')} · historically one of the closest names to {data.symbol}
                  </div>
                </div>
                <span className={`score-pill ${entry.sameSector ? 'score-pill--positive' : 'score-pill--neutral'}`}>
                  {formatScore(entry.score, 3)}
                </span>
              </article>
            ))}
          </div>
        </div>

        <div className="workspace-layout__side">
          <Panel variant="utility">
            <SectionHeader title="Where the circle clusters" />
            <div className="workspace-note-list">
              {data.sectors.map((entry) => (
                <div key={entry.sector ?? 'unclassified'} className="workspace-note-list__item">
                  {(entry.sector ?? 'unclassified')} · {entry.count} names · weight {formatPercent(entry.weightShare)} · avg {formatScore(entry.averageScore, 3)}
                </div>
              ))}
            </div>
          </Panel>

          <Panel variant="utility">
            <SectionHeader title="How tight the circle is" />
            <div className="workspace-note-list">
              {data.bands.map((entry) => (
                <div key={entry.band} className="workspace-note-list__item">
                  {entry.band.replace('_', ' ')} · {entry.count}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </Panel>
  );
}

function formatExposureRunSummary(run: AnalysisRunListItem | AnalysisRunDetailResponse): string {
  if (run.kind !== 'exposure') {
    return 'Unsupported run kind.';
  }

  return `${run.buildRunId.slice(0, 8)} · ${run.request.symbol} · neighbors ${run.request.k}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}