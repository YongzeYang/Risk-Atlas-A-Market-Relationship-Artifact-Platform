import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ActiveAnalysisRunPanel, RecentAnalysisRunsPanel } from '../../../components/analysis/AnalysisRunPanels';
import HeatmapGrid from '../../../components/data-display/HeatmapGrid';
import BoundaryNote from '../../../components/ui/BoundaryNote';
import Panel from '../../../components/ui/Panel';
import Modal from '../../../components/ui/Modal';
import SectionHeader from '../../../components/ui/SectionHeader';
import WorkflowStrip from '../../../components/ui/WorkflowStrip';
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
import { buildAnalysisWorkflowItems } from '../../../lib/analysis-workflow';
import { formatDateOnly, formatInteger, formatScore } from '../../../lib/format';
import { formatLookbackLabel, formatSnapshotOptionLabel } from '../../../lib/snapshot-language';
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
  const workflowItems = buildAnalysisWorkflowItems('groups', {
    groupsTo: buildId ? `/structure?build=${buildId}` : '/structure',
    compareTo: buildId ? `/compare?left=${buildId}` : '/compare',
    relationshipsTo: buildId ? `/divergence?build=${buildId}` : '/divergence',
    spilloverTo: buildId ? `/exposure?build=${buildId}` : '/exposure'
  });

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
        setError('Select a ready snapshot before preparing groups analysis.');
        return;
      }

      if (!inviteCode) {
        setError('Invite code is required before preparing groups analysis.');
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
        setError(nextError instanceof Error ? nextError.message : 'Failed to prepare groups analysis.');
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
        setCompareError('Select two different ready snapshots before comparing group drift.');
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
        setCompareError(nextError instanceof Error ? nextError.message : 'Groups compare failed.');
      } finally {
        setCompareLoading(false);
      }
    },
    [buildId, compareRightId, heatmapSize, persistQuery, runId]
  );

  return (
    <div className="page page--structure">
      <section className="workspace-hero workspace-hero--structure">
        <div className="workspace-hero__copy">
          <div className="workspace-hero__intro">
            <div className="workspace-hero__lead">
              <div className="workspace-hero__eyebrow">Hidden groups</div>
              <h1 className="workspace-hero__title">Which names keep acting like one bloc?</h1>
              <p className="workspace-hero__description">
                Reorder the basket into hidden groups so concentration, outliers, and loose edges show up at a glance.
              </p>
              <p className="workspace-hero__subline">
                Use this after the basket read when the label looks flatter than the behaviour underneath it.
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
                <article className={`workspace-hero__stat-card${activeResult?.clusterCount ? ' workspace-hero__stat-card--highlight' : ''}`}>
                  <div className="workspace-hero__stat-value mono">{formatInteger(activeResult?.clusterCount ?? 0)}</div>
                  <div className="workspace-hero__stat-label">Hidden groups</div>
                </article>
                <article className="workspace-hero__stat-card">
                  <div className="workspace-hero__stat-value mono">{activeResult ? formatScore(activeResult.clusterThreshold, 2) : '—'}</div>
                  <div className="workspace-hero__stat-label">Group strictness</div>
                </article>

                <div className="workspace-hero__stat-note">
                  <strong>Best setup:</strong> use this when you want to see blocs and outliers before deciding whether a second snapshot compare is worth it.
                </div>
              </div>
            </div>
          </div>

          <BoundaryNote className="workspace-hero__note" variant="accent">
            These groups describe one snapshot window only. They are not permanent labels or taxonomies.
          </BoundaryNote>
          <div className="workspace-hero__actions">
            <Link to="/exposure" className="button button--secondary">
              Open spillover
            </Link>
            <Link to="/compare" className="button button--ghost">
              What changed
            </Link>
          </div>
        </div>
      </section>

      <WorkflowStrip
        title="Follow the question, not the tool list"
        subtitle="Stay broad here first. Only move into Compare, Relationships, or Spillover when the hidden-group read already tells you which narrower question matters next."
        items={workflowItems}
        className="analysis-flow-strip"
        compact
      />

      <div className="workspace-layout">
        <div className="workspace-layout__main">
          <Panel variant="primary">
            <SectionHeader
              title="Prepare a saved groups read"
              subtitle="Queue the grouped read once, then revisit or compare later."
              action={
                <button
                  type="button"
                  className="button button--secondary button--sm"
                  onClick={() => setPreviewOpen(true)}
                  disabled={!selectedBuild}
                >
                  Preview groups
                </button>
              }
            />

            <form className="query-form query-form--wide" onSubmit={handleAnalyze}>
              <label className="field">
                <span className="field__label">Snapshot</span>
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
                      {formatSnapshotOptionLabel(buildRun)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field__label">Preview slice</span>
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
                  disabled={submitting || !buildId || !inviteCode}
                >
                  {submitting ? 'Preparing…' : 'Prepare groups view'}
                </button>
              </div>
            </form>
          </Panel>

          <Panel variant="primary">
            <SectionHeader
              title="Latest groups read"
              subtitle="Saved results stay available after reload, so the same ordered view can be reopened later."
            />
            <ActiveAnalysisRunPanel
              run={run}
              loading={runLoading}
              idleTitle="No current result"
              idleDescription="Prepare one analysis above or reopen a saved analysis from the side rail."
              formatSummary={formatStructureRunSummary}
            />
            {runError ? <div className="state-note state-note--error">{runError}</div> : null}
            {error ? <div className="state-note state-note--error">{error}</div> : null}
          </Panel>

          {activeResult ? <StructureResult data={activeResult} /> : null}

          <Panel variant="primary">
            <SectionHeader
              title="Group drift compare"
              subtitle="Use this only after both snapshots already deserve a structural compare."
            />

            <form className="query-form query-form--wide" onSubmit={handleCompare}>
              <label className="field">
                <span className="field__label">Left snapshot</span>
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
                      {formatSnapshotOptionLabel(buildRun)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field__label">Right snapshot</span>
                <select
                  className="field__control mono"
                  value={compareRightId}
                  onChange={(event) => setCompareRightId(event.target.value)}
                  disabled={compareLoading || comparableBuilds.length < 2}
                >
                  {comparableBuilds.map((buildRun) => (
                    <option key={buildRun.id} value={buildRun.id}>
                      {formatSnapshotOptionLabel(buildRun)}
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
                  {compareLoading ? 'Comparing…' : 'Compare groups'}
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
              title="Saved group reads"
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
              title="Read the group map"
              subtitle="The ordered heatmap is a summary of blocs and outliers, not a replacement for deeper drill-down."
            />

            <div className="workspace-note-list">
              <div className="workspace-note-list__item">Use this page to see whether names in the basket form distinct behavioural blocs.</div>
              <div className="workspace-note-list__item">Single-name groups usually mean loose connections rather than hidden overlap.</div>
              <div className="workspace-note-list__item">These groups belong to one snapshot window. Compare two snapshots to see the drift.</div>
            </div>
          </Panel>
        </div>
      </div>

      <Modal
        open={previewOpen}
        title="Run preview"
        subtitle="Preview the grouped slice and compare scope before you queue the saved groups read."
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
    return <div className="state-note">Select one ready snapshot to preview this run.</div>;
  }

  if (previewLoading && !previewHeatmap && leftSymbolCount === 0) {
    return <div className="state-note">Loading groups preview…</div>;
  }

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">Primary snapshot</div>
          <div className="stat-card__value mono">{selectedBuild.universeId}</div>
          <div className="stat-card__helper">{formatDateOnly(selectedBuild.asOfDate)} · {formatLookbackLabel(selectedBuild.windowDays)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Primary names</div>
          <div className="stat-card__value mono">{formatInteger(leftSymbolCount)}</div>
          <div className="stat-card__helper">Stored snapshot basket size</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Preview request</div>
          <div className="stat-card__value mono">{heatmapSize}</div>
          <div className="stat-card__helper">Requested ordered slice size</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Comparison target</div>
          <div className="stat-card__value mono">{compareRightId ? compareRightId.slice(0, 8) : '—'}</div>
          <div className="stat-card__helper">{compareRightId ? `${formatInteger(rightSymbolCount)} names` : 'Optional second snapshot'}</div>
        </div>
      </div>

      <div className="filter-summary-row" style={{ marginTop: '1rem' }}>
        <span className="filter-summary-row__item">The preview heatmap below is an open subset fetch from the current snapshot.</span>
        <span className="filter-summary-row__item">The queued run adds clustering, ordered names, and group summaries on top of that slice.</span>
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
        title="How the basket reorganizes"
        subtitle="The heatmap shows the leading ordered slice, while the list below carries the full hidden-group summary."
      />

      <div className="plain-summary">
        {(() => {
          const singleNameClusters = data.clusters.filter((c) => c.size === 1).length;
          if (singleNameClusters > data.clusters.length * 0.5) {
            return 'This basket is mostly loose — more than half the names sit on their own with no clear behavioural partner.';
          }
          return `The basket breaks into ${data.clusterCount} groups. The tightest bloc has ${Math.max(...data.clusters.map((c) => c.size))} names.`;
        })()}
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">Hidden groups</div>
          <div className="stat-card__value mono">{formatInteger(data.clusterCount)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Ordered names</div>
          <div className="stat-card__value mono">{formatInteger(data.orderedSymbols.length)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Heatmap slice</div>
          <div className="stat-card__value mono">{formatInteger(data.heatmapSymbols.length)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Group strictness</div>
          <div className="stat-card__value mono">{formatScore(data.clusterThreshold, 2)}</div>
          <div className="stat-card__helper">Higher strictness produces tighter, smaller groups</div>
        </div>
      </div>

      {data.heatmapSymbols.length > 0 ? (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="workspace-note-list__item" style={{ marginBottom: '0.5rem' }}>How the basket looks once the hidden groups are pulled into the same view.</div>
          <HeatmapGrid symbols={data.heatmapSymbols} scores={data.heatmapScores} />
        </div>
      ) : null}

      <div className="rank-list" style={{ marginTop: '1.5rem' }}>
        {data.clusters.map((cluster) => (
          <article key={cluster.id} className="rank-list__item">
            <span className="rank-list__index">{cluster.id}</span>
            <div className="rank-list__body">
              <div className="rank-list__pair">{cluster.size === 1 ? 'Standalone' : `Group ${cluster.id}`}</div>
              <div className="rank-list__meta">
                {cluster.size === 1
                  ? 'This name currently stands on its own — no strong behavioural partner in this snapshot.'
                  : cluster.size === Math.max(...data.clusters.map((c) => c.size))
                    ? `This is the clearest hidden bloc in the basket — ${cluster.size} names · ${cluster.dominantSector ?? 'unclassified'} · internal avg ${formatNullableScore(cluster.averageInternalScore)}`
                    : `${cluster.size} names · ${cluster.dominantSector ?? 'unclassified'} · internal avg ${formatNullableScore(cluster.averageInternalScore)}`
                }
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
          <div className="stat-card__label">Common names</div>
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
          <div className="stat-card__label">Group matches</div>
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
        <div className="state-note" style={{ marginTop: '1.5rem' }}>No moved names in the current comparison.</div>
      )}
    </div>
  );
}

function formatStructureRunSummary(run: AnalysisRunListItem | AnalysisRunDetailResponse): string {
  if (run.kind !== 'structure') {
    return 'Unsupported run kind.';
  }

  return `${run.buildRunId.slice(0, 8)} · preview ${run.request.heatmapSize}`;
}

function formatNullableScore(value: number | null): string {
  return value === null ? '—' : formatScore(value, 3);
}