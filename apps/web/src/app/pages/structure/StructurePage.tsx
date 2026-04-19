import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ActiveAnalysisRunPanel, RecentAnalysisRunsPanel } from '../../../components/analysis/AnalysisRunPanels';
import HeatmapGrid from '../../../components/data-display/HeatmapGrid';
import Panel from '../../../components/ui/Panel';
import Modal from '../../../components/ui/Modal';
import SectionHeader from '../../../components/ui/SectionHeader';
import {
  compareBuildStructures,
  createStructureAnalysisRun,
  getHeatmapSubset
} from '../../../features/builds/api';
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
  CompareBuildStructuresResponse,
  HeatmapSubsetResponse,
  StructureResponse
} from '../../../types/api';

const DEFAULT_HEATMAP_SIZE = '12';

export default function StructurePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [buildId, setBuildId] = useState(searchParams.get('build') ?? '');
  const [runId, setRunId] = useState(searchParams.get('run') ?? '');
  const [heatmapSize, setHeatmapSize] = useState(
    searchParams.get('heatmapSize') ?? DEFAULT_HEATMAP_SIZE
  );
  const [compareRightId, setCompareRightId] = useState(searchParams.get('compare') ?? '');
  const [compareResult, setCompareResult] = useState<CompareBuildStructuresResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [previewHeatmap, setPreviewHeatmap] = useState<HeatmapSubsetResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewHeatmapLoading, setPreviewHeatmapLoading] = useState(false);
  const { inviteCode, setInviteCode } = useInviteCode();
  const { buildRuns, loading: buildRunsLoading } = useBuildRunsData(5000);
  const {
    detail: leftDetail,
    loading: leftDetailLoading,
    error: leftDetailError
  } = useBuildDetailData(previewOpen ? buildId || undefined : undefined, 5000);
  const {
    detail: rightDetail,
    loading: rightDetailLoading,
    error: rightDetailError
  } = useBuildDetailData(previewOpen && compareRightId ? compareRightId : undefined, 5000);
  const { run, loading: runLoading, error: runError } = useAnalysisRunData(runId || undefined, 1500);
  const { runs: recentRuns, loading: recentRunsLoading } = useAnalysisRunListData(
    'structure',
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
    const nextBuildId = comparableBuilds.some((item) => item.id === queryBuild)
      ? queryBuild
      : comparableBuilds[0]?.id ?? '';

    if (nextBuildId) {
      setBuildId(nextBuildId);
    }
  }, [buildId, comparableBuilds, run, runError, runId, searchParams]);

  useEffect(() => {
    if (comparableBuilds.length < 2) {
      return;
    }

    const fallbackCompareId = comparableBuilds.find((item) => item.id !== buildId)?.id ?? '';
    if (!compareRightId || compareRightId === buildId) {
      setCompareRightId(fallbackCompareId);
    }
  }, [buildId, comparableBuilds, compareRightId]);

  useEffect(() => {
    if (!run || run.kind !== 'structure') {
      return;
    }

    setBuildId(run.buildRunId);
    setHeatmapSize(String(run.request.heatmapSize));
  }, [run]);

  const selectedBuild = useMemo(
    () => comparableBuilds.find((item) => item.id === buildId) ?? null,
    [buildId, comparableBuilds]
  );

  const previewSymbols = useMemo(() => {
    if (!leftDetail) {
      return [] as string[];
    }

    const desiredCount = Math.max(2, Math.min(Number(heatmapSize) || 6, 6));
    const seen = new Set<string>();
    const nextSymbols: string[] = [];

    for (const pair of leftDetail.topPairs) {
      if (!seen.has(pair.left)) {
        seen.add(pair.left);
        nextSymbols.push(pair.left);
      }
      if (nextSymbols.length >= desiredCount) {
        break;
      }
      if (!seen.has(pair.right)) {
        seen.add(pair.right);
        nextSymbols.push(pair.right);
      }
      if (nextSymbols.length >= desiredCount) {
        break;
      }
    }

    for (const symbol of leftDetail.symbolOrder) {
      if (nextSymbols.length >= desiredCount) {
        break;
      }
      if (!seen.has(symbol)) {
        seen.add(symbol);
        nextSymbols.push(symbol);
      }
    }

    return nextSymbols;
  }, [heatmapSize, leftDetail]);

  useEffect(() => {
    if (!previewOpen || !buildId || previewSymbols.length < 2) {
      setPreviewHeatmap(null);
      setPreviewError(null);
      setPreviewHeatmapLoading(false);
      return;
    }

    let cancelled = false;
    setPreviewError(null);
    setPreviewHeatmapLoading(true);

    void getHeatmapSubset(buildId, previewSymbols)
      .then((data) => {
        if (!cancelled) {
          setPreviewHeatmap(data);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setPreviewHeatmap(null);
          setPreviewError(nextError instanceof Error ? nextError.message : 'Preview heatmap lookup failed.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewHeatmapLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [buildId, previewOpen, previewSymbols]);

  const activeResult = run?.kind === 'structure' ? run.result : null;

  const persistQuery = useCallback(
    (next: {
      buildId: string;
      runId?: string;
      heatmapSize: number | string;
      compareRightId?: string;
    }) => {
      const params = new URLSearchParams();
      params.set('build', next.buildId);
      params.set('heatmapSize', String(next.heatmapSize));
      if (next.runId) {
        params.set('run', next.runId);
      }
      if (next.compareRightId) {
        params.set('compare', next.compareRightId);
      }
      setSearchParams(params);
    },
    [setSearchParams]
  );

  const adoptRun = useCallback(
    (nextRun: AnalysisRunDetailResponse | AnalysisRunListItem) => {
      if (nextRun.kind !== 'structure') {
        return;
      }

      setRunId(nextRun.id);
      setBuildId(nextRun.buildRunId);
      setHeatmapSize(String(nextRun.request.heatmapSize));

      persistQuery({
        buildId: nextRun.buildRunId,
        runId: nextRun.id,
        heatmapSize: nextRun.request.heatmapSize,
        compareRightId
      });
    },
    [compareRightId, persistQuery]
  );

  const handleAnalyze = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (!buildId) {
        setError('Select a succeeded build before queueing structure analysis.');
        return;
      }

      if (!inviteCode) {
        setError('Invite code is required before queueing structure analysis.');
        return;
      }

      const parsedHeatmapSize = Number(heatmapSize);
      if (!Number.isFinite(parsedHeatmapSize)) {
        setError('Heatmap size must be numeric.');
        return;
      }

      setSubmitting(true);
      setError(null);

      try {
        const queued = await createStructureAnalysisRun(
          {
            buildRunId: buildId,
            heatmapSize: parsedHeatmapSize
          },
          inviteCode
        );

        adoptRun(queued);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to queue structure analysis.');
      } finally {
        setSubmitting(false);
      }
    },
    [adoptRun, buildId, heatmapSize, inviteCode]
  );

  const handleCompare = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (!buildId || !compareRightId || buildId === compareRightId) {
        setCompareError('Select two different succeeded builds before comparing structure drift.');
        setCompareResult(null);
        return;
      }

      setCompareLoading(true);
      setCompareError(null);
      setCompareResult(null);

      try {
        const data = await compareBuildStructures(buildId, compareRightId);
        setCompareResult(data);
        persistQuery({
          buildId,
          runId,
          heatmapSize,
          compareRightId
        });
      } catch (nextError) {
        setCompareError(nextError instanceof Error ? nextError.message : 'Structure compare failed.');
      } finally {
        setCompareLoading(false);
      }
    },
    [buildId, compareRightId, heatmapSize, persistQuery, runId]
  );

  return (
    <div className="page page--structure">
      <section className="workspace-hero">
        <div className="workspace-hero__copy">
          <div className="workspace-hero__eyebrow">Clustered structure</div>
          <h1 className="workspace-hero__title">Reorder the matrix into clusters so the market structure becomes readable at a glance.</h1>
          <p className="workspace-hero__description">
            Queue the structure run for one build, reopen the saved result later, and keep the
            compare workflow ready for side-by-side drift inspection.
          </p>
          <div className="workspace-hero__actions">
            <Link to="/exposure" className="button button--secondary">
              Open exposure
            </Link>
            <Link to="/compare" className="button button--ghost">
              Pair-drift compare
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
            <div className="workspace-hero__stat-value mono">{formatInteger(activeResult?.clusterCount ?? 0)}</div>
            <div className="workspace-hero__stat-label">Clusters</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{activeResult ? formatScore(activeResult.clusterThreshold, 2) : '—'}</div>
            <div className="workspace-hero__stat-label">Threshold</div>
          </article>
        </div>
      </section>

      <div className="workspace-layout">
        <div className="workspace-layout__main">
          <Panel variant="primary">
            <SectionHeader
              title="Structure settings"
              subtitle="Queue the ordered structure run first, then compare cluster drift only when you need the second pass."
              action={
                <button
                  type="button"
                  className="button button--secondary button--sm"
                  onClick={() => setPreviewOpen(true)}
                  disabled={!selectedBuild}
                >
                  Open preview
                </button>
              }
            />

            <form className="query-form query-form--wide" onSubmit={handleAnalyze}>
              <label className="field">
                <span className="field__label">Build</span>
                <select
                  className="field__control mono"
                  value={buildId}
                  onChange={(event) => {
                    setBuildId(event.target.value);
                    setRunId('');
                    setCompareResult(null);
                  }}
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
                <span className="field__label">Heatmap slice</span>
                <select
                  className="field__control mono"
                  value={heatmapSize}
                  onChange={(event) => setHeatmapSize(event.target.value)}
                >
                  <option value="8">8</option>
                  <option value="10">10</option>
                  <option value="12">12</option>
                  <option value="16">16</option>
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
                  disabled={submitting || !buildId || !inviteCode}
                >
                  {submitting ? 'Queueing…' : 'Queue structure'}
                </button>
              </div>
            </form>
          </Panel>

          <Panel variant="primary">
            <SectionHeader
              title="Active run"
              subtitle="Queued structure runs survive reloads and can be reopened from recent history."
            />
            <ActiveAnalysisRunPanel
              run={run}
              loading={runLoading}
              idleTitle="No active structure run selected"
              idleDescription="Queue one run above or reopen a recent run from the side rail."
              formatSummary={formatStructureRunSummary}
            />
            {runError ? <div className="state-note state-note--error">{runError}</div> : null}
            {error ? <div className="state-note state-note--error">{error}</div> : null}
          </Panel>

          {activeResult ? <StructureResult data={activeResult} /> : null}

          <Panel variant="primary">
            <SectionHeader
              title="Cluster drift compare"
              subtitle="This compare action stays direct and is best used after you already know both builds are worth comparing."
            />

            <form className="query-form query-form--wide" onSubmit={handleCompare}>
              <label className="field">
                <span className="field__label">Base build</span>
                <select
                  className="field__control mono"
                  value={buildId}
                  onChange={(event) => {
                    setBuildId(event.target.value);
                    setRunId('');
                    setCompareResult(null);
                  }}
                  disabled={compareLoading || comparableBuilds.length < 2}
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
                  value={compareRightId}
                  onChange={(event) => setCompareRightId(event.target.value)}
                  disabled={compareLoading || comparableBuilds.length < 2}
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
                  type="submit"
                  className="button button--primary"
                  disabled={compareLoading || !buildId || !compareRightId || buildId === compareRightId}
                >
                  {compareLoading ? 'Comparing…' : 'Compare structure'}
                </button>
              </div>
            </form>

            {compareError ? <div className="state-note state-note--error">{compareError}</div> : null}
            {compareResult ? <StructureCompareResult data={compareResult} /> : null}
          </Panel>
        </div>

        <div className="workspace-layout__side">
          <Panel variant="utility">
            <SectionHeader
              title="Recent runs"
              subtitle="Reopen finished or still-running structure runs without queueing them again."
            />
            <RecentAnalysisRunsPanel
              runs={recentRuns}
              loading={recentRunsLoading}
              activeRunId={runId}
              emptyCopy={
                buildId
                  ? 'No structure runs yet for the selected build.'
                  : 'Select a build to load recent structure runs.'
              }
              formatSummary={formatStructureRunSummary}
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
              title="Reading guide"
              subtitle="The ordered heatmap is a structural summary, not a replacement for deeper drill-down."
            />

            <div className="workspace-note-list">
              <div className="workspace-note-list__item">Browsing and compare queries stay open; only queue creation requires an invite code.</div>
              <div className="workspace-note-list__item">Use the ordered heatmap to see whether similar names now appear in block-like groups instead of a noisy matrix.</div>
              <div className="workspace-note-list__item">Use cluster summaries to interpret size, dominant sector, and cohesion.</div>
              <div className="workspace-note-list__item">Use cluster drift compare to identify which symbols moved across groups, not just which pairs drifted.</div>
            </div>
          </Panel>
        </div>
      </div>

      <Modal
        open={previewOpen}
        title="Run preview"
        subtitle="Preview the clustered slice and comparison scope before you queue the heavier structure pass."
        onClose={() => setPreviewOpen(false)}
      >
        <StructurePreview
          selectedBuild={selectedBuild}
          compareRightId={compareRightId}
          heatmapSize={heatmapSize}
          leftSymbolCount={leftDetail?.symbolOrder.length ?? 0}
          rightSymbolCount={rightDetail?.symbolOrder.length ?? 0}
          previewHeatmap={previewHeatmap}
          previewError={previewError ?? leftDetailError ?? rightDetailError}
          previewLoading={
            previewHeatmapLoading || leftDetailLoading || (Boolean(compareRightId) && rightDetailLoading)
          }
        />
      </Modal>
    </div>
  );
}

function StructurePreview({
  selectedBuild,
  compareRightId,
  heatmapSize,
  leftSymbolCount,
  rightSymbolCount,
  previewHeatmap,
  previewError,
  previewLoading
}: {
  selectedBuild: BuildRunListItem | null;
  compareRightId: string;
  heatmapSize: string;
  leftSymbolCount: number;
  rightSymbolCount: number;
  previewHeatmap: HeatmapSubsetResponse | null;
  previewError: string | null;
  previewLoading: boolean;
}) {
  if (!selectedBuild) {
    return <div className="state-note">Select one succeeded build to preview this run.</div>;
  }

  if (previewLoading && !previewHeatmap && leftSymbolCount === 0) {
    return <div className="state-note">Loading structure preview…</div>;
  }

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">Primary build</div>
          <div className="stat-card__value mono">{selectedBuild.universeId}</div>
          <div className="stat-card__helper">{formatDateOnly(selectedBuild.asOfDate)} · {selectedBuild.windowDays}d</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Primary symbols</div>
          <div className="stat-card__value mono">{formatInteger(leftSymbolCount)}</div>
          <div className="stat-card__helper">Stored artifact universe size</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Heatmap request</div>
          <div className="stat-card__value mono">{heatmapSize}</div>
          <div className="stat-card__helper">Requested ordered slice size</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Comparison target</div>
          <div className="stat-card__value mono">{compareRightId ? compareRightId.slice(0, 8) : '—'}</div>
          <div className="stat-card__helper">{compareRightId ? `${formatInteger(rightSymbolCount)} symbols` : 'Optional second build'}</div>
        </div>
      </div>

      <div className="filter-summary-row" style={{ marginTop: '1rem' }}>
        <span className="filter-summary-row__item">The preview heatmap below is an open subset fetch from the current build.</span>
        <span className="filter-summary-row__item">The queued run adds clustering, ordered symbols, and cluster summaries on top of that slice.</span>
      </div>

      {previewError ? <div className="state-note state-note--error" style={{ marginTop: '1rem' }}>{previewError}</div> : null}

      {previewHeatmap ? (
        <div style={{ marginTop: '1rem' }}>
          <HeatmapGrid symbols={previewHeatmap.symbolOrder} scores={previewHeatmap.scores} />
        </div>
      ) : null}
    </>
  );
}

function StructureResult({ data }: { data: StructureResponse }) {
  return (
    <Panel variant="primary">
      <SectionHeader
        title="Ordered structure"
        subtitle="The heatmap shows the leading ordered slice, while the cluster list carries the full grouping summary."
      />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">Clusters</div>
          <div className="stat-card__value mono">{formatInteger(data.clusterCount)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Ordered symbols</div>
          <div className="stat-card__value mono">{formatInteger(data.orderedSymbols.length)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Heatmap slice</div>
          <div className="stat-card__value mono">{formatInteger(data.heatmapSymbols.length)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Threshold</div>
          <div className="stat-card__value mono">{formatScore(data.clusterThreshold, 2)}</div>
        </div>
      </div>

      {data.heatmapSymbols.length > 0 ? (
        <div style={{ marginTop: '1.5rem' }}>
          <HeatmapGrid symbols={data.heatmapSymbols} scores={data.heatmapScores} />
        </div>
      ) : null}

      <div className="rank-list" style={{ marginTop: '1.5rem' }}>
        {data.clusters.map((cluster) => (
          <article key={cluster.id} className="rank-list__item">
            <span className="rank-list__index">{cluster.id}</span>
            <div className="rank-list__body">
              <div className="rank-list__pair">Cluster {cluster.id}</div>
              <div className="rank-list__meta">
                {cluster.size} names · dominant sector {cluster.dominantSector ?? 'unclassified'} · internal avg {formatNullableScore(cluster.averageInternalScore)}
              </div>
              <div className="rank-list__meta mono">{cluster.symbols.slice(0, 8).join(', ')}{cluster.symbols.length > 8 ? ' …' : ''}</div>
            </div>
            <span className="score-pill score-pill--neutral">{cluster.size}</span>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function StructureCompareResult({ data }: { data: CompareBuildStructuresResponse }) {
  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">Common symbols</div>
          <div className="stat-card__value mono">{formatInteger(data.commonSymbolCount)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Stable</div>
          <div className="stat-card__value mono">{formatInteger(data.stableSymbolCount)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Changed</div>
          <div className="stat-card__value mono">{formatInteger(data.changedSymbolCount)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Cluster matches</div>
          <div className="stat-card__value mono">{formatInteger(data.clusterMatches.length)}</div>
        </div>
      </div>

      {data.movedSymbols.length > 0 ? (
        <div className="rank-list" style={{ marginTop: '1.5rem' }}>
          {data.movedSymbols.map((entry) => (
            <article key={entry.symbol} className="rank-list__item">
              <span className="rank-list__index mono">{entry.symbol}</span>
              <div className="rank-list__body">
                <div className="rank-list__pair">{entry.leftClusterId} → {entry.rightClusterId}</div>
                <div className="rank-list__meta">
                  Left {entry.leftDominantSector ?? 'unclassified'} ({entry.leftClusterSize}) · Right {entry.rightDominantSector ?? 'unclassified'} ({entry.rightClusterSize})
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="state-note" style={{ marginTop: '1.5rem' }}>No moved symbols in the current comparison.</div>
      )}
    </div>
  );
}

function formatBuildOption(buildRun: BuildRunListItem): string {
  return `${buildRun.universeId} · ${formatDateOnly(buildRun.asOfDate)} · ${buildRun.windowDays}d · ${buildRun.id.slice(0, 8)}`;
}

function formatStructureRunSummary(run: AnalysisRunListItem | AnalysisRunDetailResponse): string {
  if (run.kind !== 'structure') {
    return 'Unsupported run kind.';
  }

  return `${run.buildRunId.slice(0, 8)} · heatmap ${run.request.heatmapSize}`;
}

function formatNullableScore(value: number | null): string {
  return value === null ? '—' : formatScore(value, 3);
}