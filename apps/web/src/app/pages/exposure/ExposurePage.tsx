import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ActiveAnalysisRunPanel, RecentAnalysisRunsPanel } from '../../../components/analysis/AnalysisRunPanels';
import Panel from '../../../components/ui/Panel';
import SectionHeader from '../../../components/ui/SectionHeader';
import { createExposureAnalysisRun, getNeighbors } from '../../../features/builds/api';
import {
  useAnalysisRunData,
  useAnalysisRunListData,
  useBuildDetailData,
  useBuildRunsData,
  useInviteCode
} from '../../../features/builds/hooks';
import { formatDateOnly, formatInteger, formatScore } from '../../../lib/format';
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
  const [preview, setPreview] = useState<NeighborsResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
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
    if (comparableBuilds.length === 0 || buildId) {
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
  }, [buildId, comparableBuilds, searchParams]);

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
    if (!buildId || !symbol || !Number.isFinite(parsedK)) {
      setPreview(null);
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    setPreviewError(null);

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
      });

    return () => {
      cancelled = true;
    };
  }, [buildId, k, symbol]);

  const selectedBuild = useMemo(
    () => comparableBuilds.find((item) => item.id === buildId) ?? null,
    [buildId, comparableBuilds]
  );

  const activeResult = run?.kind === 'exposure' ? run.result : null;

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
        setError('Select a succeeded build and anchor symbol before queueing exposure analysis.');
        return;
      }

      if (!inviteCode) {
        setError('Invite code is required before queueing exposure analysis.');
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
        setError(nextError instanceof Error ? nextError.message : 'Failed to queue exposure analysis.');
      } finally {
        setSubmitting(false);
      }
    },
    [adoptRun, buildId, inviteCode, k, symbol]
  );

  return (
    <div className="page page--exposure">
      <section className="workspace-hero">
        <div className="workspace-hero__copy">
          <div className="workspace-hero__eyebrow">Co-movement exposure</div>
          <h1 className="workspace-hero__title">Start from one symbol and expose how concentrated its market neighborhood really is.</h1>
          <p className="workspace-hero__description">
            Queue the exposure readout, keep working elsewhere, and reopen the persisted result
            later instead of pinning the browser to one long request.
          </p>
          <div className="workspace-hero__actions">
            <Link to="/builds" className="button button--secondary">
              Browse builds
            </Link>
            <Link to="/structure" className="button button--ghost">
              Open structure view
            </Link>
          </div>
        </div>

        <div className="workspace-hero__stats">
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{formatInteger(comparableBuilds.length)}</div>
            <div className="workspace-hero__stat-label">Succeeded builds</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{selectedBuild ? formatDateOnly(selectedBuild.asOfDate) : '—'}</div>
            <div className="workspace-hero__stat-label">Selected as-of</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{symbol || '—'}</div>
            <div className="workspace-hero__stat-label">Anchor symbol</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{formatInteger(activeResult?.neighborCount ?? 0)}</div>
            <div className="workspace-hero__stat-label">Neighbors returned</div>
          </article>
        </div>
      </section>

      <div className="workspace-layout">
        <div className="workspace-layout__main">
          <Panel variant="primary">
            <SectionHeader
              title="Exposure settings"
              subtitle="Queue the run, then revisit the saved result later by run id."
            />

            {comparableBuilds.length === 0 && !buildRunsLoading ? (
              <div className="state-note state-note--error">
                At least one succeeded build is required before exposure analysis becomes available.
              </div>
            ) : null}

            <form className="query-form query-form--wide" onSubmit={handleAnalyze}>
              <label className="field">
                <span className="field__label">Build</span>
                <select
                  className="field__control mono"
                  value={buildId}
                  onChange={(event) => setBuildId(event.target.value)}
                  disabled={submitting || buildRunsLoading || comparableBuilds.length === 0}
                >
                  {comparableBuilds.map((buildRun) => (
                    <option key={buildRun.id} value={buildRun.id}>
                      {formatBuildOption(buildRun)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field__label">Anchor symbol</span>
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
                <span className="field__label">Neighbor depth</span>
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
                  placeholder="Required for queueing analysis"
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
                  {submitting ? 'Queueing…' : 'Queue exposure'}
                </button>
              </div>
            </form>
          </Panel>

          <Panel variant="utility">
            <SectionHeader
              title="Run preview"
              subtitle="Preview the scope and a small live neighbor slice before you queue the full exposure run."
            />
            <ExposurePreview
              selectedBuild={selectedBuild}
              symbol={symbol}
              k={k}
              universeSize={detail?.symbolOrder.length ?? 0}
              preview={preview}
              previewError={previewError}
            />
          </Panel>

          <Panel variant="primary">
            <SectionHeader
              title="Active run"
              subtitle="Queued runs keep their status and results after reload."
            />
            <ActiveAnalysisRunPanel
              run={run}
              loading={runLoading}
              idleTitle="No active exposure run selected"
              idleDescription="Queue one run above or reopen a recent run from the side rail."
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
              title="Recent runs"
              subtitle="Reopen finished or still-running exposure reads without requeueing them."
            />
            <RecentAnalysisRunsPanel
              runs={recentRuns}
              loading={recentRunsLoading}
              activeRunId={runId}
              emptyCopy="No exposure runs yet for the selected build."
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
              title="How to read it"
              subtitle="This page asks whether co-movement is broad, narrow, and sector-concentrated."
            />

            <div className="workspace-note-list">
              <div className="workspace-note-list__item">Browsing build metadata stays open; queue creation requires an invite code.</div>
              <div className="workspace-note-list__item">Use concentration index to see whether the anchor relies on only a few dominant neighbors.</div>
              <div className="workspace-note-list__item">Use same-sector weight share to distinguish sector concentration from broader market structure.</div>
              <div className="workspace-note-list__item">Strength bands make the ladder easier to interpret than a raw score list alone.</div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ExposurePreview({
  selectedBuild,
  symbol,
  k,
  universeSize,
  preview,
  previewError
}: {
  selectedBuild: BuildRunListItem | null;
  symbol: string;
  k: string;
  universeSize: number;
  preview: NeighborsResponse | null;
  previewError: string | null;
}) {
  if (!selectedBuild) {
    return <div className="state-note">Select one succeeded build to preview this run.</div>;
  }

  const averagePreviewScore =
    preview && preview.neighbors.length > 0
      ? preview.neighbors.reduce((sum, entry) => sum + entry.score, 0) / preview.neighbors.length
      : null;

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">Build scope</div>
          <div className="stat-card__value mono">{selectedBuild.universeId}</div>
          <div className="stat-card__helper">{formatDateOnly(selectedBuild.asOfDate)} · {selectedBuild.windowDays}d</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Universe size</div>
          <div className="stat-card__value mono">{formatInteger(universeSize)}</div>
          <div className="stat-card__helper">Symbols available for the anchor picker</div>
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
                <div className="rank-list__meta">Preview neighbor from the stored BSM top-k lookup.</div>
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
        title="Exposure summary"
        subtitle="The anchor symbol is shown with neighbor ladder, sector aggregation, and concentration metrics in one place."
      />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">Anchor sector</div>
          <div className="stat-card__value">{data.anchorSector ?? 'unclassified'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Avg neighbor score</div>
          <div className="stat-card__value mono">{formatScore(data.averageNeighborScore, 3)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Concentration index</div>
          <div className="stat-card__value mono">{formatScore(data.concentrationIndex, 3)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Same-sector weight</div>
          <div className="stat-card__value mono">{formatPercent(data.sameSectorWeightShare)}</div>
        </div>
      </div>

      <div className="workspace-layout" style={{ marginTop: '1.5rem' }}>
        <div className="workspace-layout__main">
          <SectionHeader
            title="Neighbor ladder"
            subtitle="Ranked by score descending from the BSM row-topk path."
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
                    Sector {entry.sector ?? 'unclassified'} · Type {entry.securityType ?? 'unknown'} · {entry.strengthBand.replace('_', ' ')}
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
            <SectionHeader title="Sector aggregation" />
            <div className="workspace-note-list">
              {data.sectors.map((entry) => (
                <div key={entry.sector ?? 'unclassified'} className="workspace-note-list__item">
                  {(entry.sector ?? 'unclassified')} · {entry.count} names · weight {formatPercent(entry.weightShare)} · avg {formatScore(entry.averageScore, 3)}
                </div>
              ))}
            </div>
          </Panel>

          <Panel variant="utility">
            <SectionHeader title="Strength bands" />
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

function formatBuildOption(buildRun: BuildRunListItem): string {
  return `${buildRun.universeId} · ${formatDateOnly(buildRun.asOfDate)} · ${buildRun.windowDays}d · ${buildRun.id.slice(0, 8)}`;
}

function formatExposureRunSummary(run: AnalysisRunListItem | AnalysisRunDetailResponse): string {
  if (run.kind !== 'exposure') {
    return 'Unsupported run kind.';
  }

  return `${run.buildRunId.slice(0, 8)} · ${run.request.symbol} · top ${run.request.k}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}