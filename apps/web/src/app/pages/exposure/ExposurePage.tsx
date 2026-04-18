import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import Panel from '../../../components/ui/Panel';
import SectionHeader from '../../../components/ui/SectionHeader';
import { getBuildRunExposure } from '../../../features/builds/api';
import { useBuildDetailData, useBuildRunsData } from '../../../features/builds/hooks';
import { formatDateOnly, formatInteger, formatScore } from '../../../lib/format';
import type { BuildRunListItem, ExposureResponse } from '../../../types/api';

const DEFAULT_K = '12';

export default function ExposurePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [buildId, setBuildId] = useState(searchParams.get('build') ?? '');
  const [symbol, setSymbol] = useState(searchParams.get('symbol') ?? '');
  const [k, setK] = useState(searchParams.get('k') ?? DEFAULT_K);
  const [result, setResult] = useState<ExposureResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { buildRuns, loading: buildRunsLoading } = useBuildRunsData(5000);
  const comparableBuilds = useMemo(
    () => buildRuns.filter((item) => item.status === 'succeeded'),
    [buildRuns]
  );
  const { detail } = useBuildDetailData(buildId || undefined, 5000);

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

  const selectedBuild = useMemo(
    () => comparableBuilds.find((item) => item.id === buildId) ?? null,
    [buildId, comparableBuilds]
  );

  const handleAnalyze = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (!buildId || !symbol) {
        setError('Select a succeeded build and anchor symbol before running exposure analysis.');
        setResult(null);
        return;
      }

      const parsedK = Number(k);
      if (!Number.isFinite(parsedK)) {
        setError('Neighbor depth must be numeric.');
        setResult(null);
        return;
      }

      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const data = await getBuildRunExposure(buildId, {
          symbol,
          k: parsedK
        });

        setResult(data);
        setSearchParams({
          build: buildId,
          symbol,
          k: String(parsedK)
        });
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Exposure analysis failed.');
      } finally {
        setLoading(false);
      }
    },
    [buildId, k, setSearchParams, symbol]
  );

  return (
    <div className="page page--exposure">
      <section className="workspace-hero">
        <div className="workspace-hero__copy">
          <div className="workspace-hero__eyebrow">Co-movement exposure</div>
          <h1 className="workspace-hero__title">Start from one symbol and expose how concentrated its market neighborhood really is.</h1>
          <p className="workspace-hero__description">
            This surface promotes neighbors from a utility lookup into a real exposure workflow
            with sector aggregation, strength banding, and a simple concentration readout.
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
            <div className="workspace-hero__stat-value mono">{result ? formatInteger(result.neighborCount) : '0'}</div>
            <div className="workspace-hero__stat-label">Neighbors returned</div>
          </article>
        </div>
      </section>

      <div className="workspace-layout">
        <div className="workspace-layout__main">
          <Panel variant="primary">
            <SectionHeader
              title="Exposure settings"
              subtitle="Select a build and anchor symbol, then inspect where the strongest co-movement weight actually concentrates."
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
                <span className="field__label">Anchor symbol</span>
                <select
                  className="field__control mono"
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value)}
                  disabled={loading || !detail || detail.symbolOrder.length === 0}
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

              <div className="query-form__action query-form__action--stack">
                <button
                  type="submit"
                  className="button button--primary"
                  disabled={loading || !buildId || !symbol}
                >
                  {loading ? 'Analyzing…' : 'Run exposure'}
                </button>
              </div>
            </form>
          </Panel>

          {error ? (
            <Panel variant="primary">
              <div className="state-note state-note--error">{error}</div>
            </Panel>
          ) : null}

          {result ? <ExposureResult data={result} /> : null}
        </div>

        <div className="workspace-layout__side">
          <Panel variant="utility">
            <SectionHeader
              title="How to read it"
              subtitle="This page asks whether co-movement is broad, narrow, and sector-concentrated."
            />

            <div className="workspace-note-list">
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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}