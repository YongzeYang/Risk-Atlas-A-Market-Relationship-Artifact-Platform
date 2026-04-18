import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import HeatmapGrid from '../../../components/data-display/HeatmapGrid';
import Panel from '../../../components/ui/Panel';
import SectionHeader from '../../../components/ui/SectionHeader';
import {
  compareBuildStructures,
  getBuildRunStructure
} from '../../../features/builds/api';
import { useBuildRunsData } from '../../../features/builds/hooks';
import { formatDateOnly, formatInteger, formatScore } from '../../../lib/format';
import type {
  BuildRunListItem,
  CompareBuildStructuresResponse,
  StructureResponse
} from '../../../types/api';

const DEFAULT_HEATMAP_SIZE = '12';

export default function StructurePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [buildId, setBuildId] = useState(searchParams.get('build') ?? '');
  const [heatmapSize, setHeatmapSize] = useState(
    searchParams.get('heatmapSize') ?? DEFAULT_HEATMAP_SIZE
  );
  const [compareRightId, setCompareRightId] = useState(searchParams.get('compare') ?? '');
  const [result, setResult] = useState<StructureResponse | null>(null);
  const [compareResult, setCompareResult] = useState<CompareBuildStructuresResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const { buildRuns, loading: buildRunsLoading } = useBuildRunsData(5000);

  const comparableBuilds = useMemo(
    () => buildRuns.filter((item) => item.status === 'succeeded'),
    [buildRuns]
  );

  useEffect(() => {
    if (comparableBuilds.length === 0 || buildId) {
      return;
    }

    const queryBuild = searchParams.get('build') ?? '';
    const nextBuildId = comparableBuilds.some((item) => item.id === queryBuild)
      ? queryBuild
      : comparableBuilds[0]?.id ?? '';

    if (nextBuildId) {
      setBuildId(nextBuildId);
    }
  }, [buildId, comparableBuilds, searchParams]);

  useEffect(() => {
    if (comparableBuilds.length < 2 || compareRightId) {
      return;
    }

    const queryCompare = searchParams.get('compare') ?? '';
    const fallbackCompareId = comparableBuilds.find((item) => item.id !== buildId)?.id ?? '';
    const nextCompareId = comparableBuilds.some((item) => item.id === queryCompare)
      ? queryCompare
      : fallbackCompareId;

    if (nextCompareId) {
      setCompareRightId(nextCompareId);
    }
  }, [buildId, comparableBuilds, compareRightId, searchParams]);

  const selectedBuild = useMemo(
    () => comparableBuilds.find((item) => item.id === buildId) ?? null,
    [buildId, comparableBuilds]
  );

  const handleAnalyze = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (!buildId) {
        setError('Select a succeeded build before running structure analysis.');
        setResult(null);
        return;
      }

      const parsedHeatmapSize = Number(heatmapSize);
      if (!Number.isFinite(parsedHeatmapSize)) {
        setError('Heatmap size must be numeric.');
        setResult(null);
        return;
      }

      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const data = await getBuildRunStructure(buildId, {
          heatmapSize: parsedHeatmapSize
        });

        setResult(data);
        setSearchParams((current) => {
          current.set('build', buildId);
          current.set('heatmapSize', String(parsedHeatmapSize));
          if (compareRightId) {
            current.set('compare', compareRightId);
          }
          return current;
        });
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Structure analysis failed.');
      } finally {
        setLoading(false);
      }
    },
    [buildId, compareRightId, heatmapSize, setSearchParams]
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
        setSearchParams((current) => {
          current.set('build', buildId);
          current.set('heatmapSize', heatmapSize);
          current.set('compare', compareRightId);
          return current;
        });
      } catch (nextError) {
        setCompareError(nextError instanceof Error ? nextError.message : 'Structure compare failed.');
      } finally {
        setCompareLoading(false);
      }
    },
    [buildId, compareRightId, heatmapSize, setSearchParams]
  );

  return (
    <div className="page page--structure">
      <section className="workspace-hero">
        <div className="workspace-hero__copy">
          <div className="workspace-hero__eyebrow">Clustered structure</div>
          <h1 className="workspace-hero__title">Reorder the matrix into clusters so the market structure becomes readable at a glance.</h1>
          <p className="workspace-hero__description">
            This surface turns one build into an ordered heatmap with cluster summaries, then
            compares cluster membership drift between builds.
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
            <div className="workspace-hero__stat-value mono">{result ? formatInteger(result.clusterCount) : '0'}</div>
            <div className="workspace-hero__stat-label">Clusters</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{result ? formatScore(result.clusterThreshold, 2) : '—'}</div>
            <div className="workspace-hero__stat-label">Threshold</div>
          </article>
        </div>
      </section>

      <div className="workspace-layout">
        <div className="workspace-layout__main">
          <Panel variant="primary">
            <SectionHeader
              title="Structure settings"
              subtitle="Start with one build to inspect the ordered heatmap, then compare the resulting cluster membership against a second build."
            />

            <form className="query-form query-form--wide" onSubmit={handleAnalyze}>
              <label className="field">
                <span className="field__label">Build</span>
                <select
                  className="field__control mono"
                  value={buildId}
                  onChange={(event) => setBuildId(event.target.value)}
                  disabled={loading || buildRunsLoading || comparableBuilds.length === 0}
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
                </select>
              </label>

              <div className="query-form__action query-form__action--stack">
                <button
                  type="submit"
                  className="button button--primary"
                  disabled={loading || !buildId}
                >
                  {loading ? 'Analyzing…' : 'Run structure'}
                </button>
              </div>
            </form>
          </Panel>

          {error ? (
            <Panel variant="primary">
              <div className="state-note state-note--error">{error}</div>
            </Panel>
          ) : null}

          {result ? <StructureResult data={result} /> : null}

          <Panel variant="primary">
            <SectionHeader
              title="Cluster drift compare"
              subtitle="Compare how the clustered structure moves between two succeeded builds."
            />

            <form className="query-form query-form--wide" onSubmit={handleCompare}>
              <label className="field">
                <span className="field__label">Base build</span>
                <select
                  className="field__control mono"
                  value={buildId}
                  onChange={(event) => setBuildId(event.target.value)}
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
              title="Reading guide"
              subtitle="The ordered heatmap is a structural summary, not a replacement for deeper drill-down."
            />

            <div className="workspace-note-list">
              <div className="workspace-note-list__item">Use the ordered heatmap to see whether similar names now appear in block-like groups instead of a noisy matrix.</div>
              <div className="workspace-note-list__item">Use cluster summaries to interpret size, dominant sector, and cohesion.</div>
              <div className="workspace-note-list__item">Use cluster drift compare to identify which symbols moved across groups, not just which pairs drifted.</div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
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

function formatNullableScore(value: number | null): string {
  return value === null ? '—' : formatScore(value, 3);
}