import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import Panel from '../../../components/ui/Panel';
import SectionHeader from '../../../components/ui/SectionHeader';
import { getPairDivergence } from '../../../features/builds/api';
import { useBuildRunsData } from '../../../features/builds/hooks';
import { formatDateOnly, formatInteger, formatScore } from '../../../lib/format';
import type { BuildRunListItem, PairDivergenceCandidate, PairDivergenceResponse } from '../../../types/api';

const DEFAULT_RECENT_WINDOW_DAYS = '20';
const DEFAULT_LIMIT = '50';
const DEFAULT_MIN_LONG_CORR_ABS = '0.35';
const DEFAULT_MIN_CORR_DELTA_ABS = '0.12';

export default function PairDivergencePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [buildId, setBuildId] = useState(searchParams.get('build') ?? '');
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
  const [result, setResult] = useState<PairDivergenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    const fallbackBuildId = comparableBuilds[0]?.id ?? '';
    const nextBuildId = comparableBuilds.some((item) => item.id === queryBuild)
      ? queryBuild
      : fallbackBuildId;

    if (nextBuildId) {
      setBuildId(nextBuildId);
    }
  }, [buildId, comparableBuilds, searchParams]);

  const selectedBuild = useMemo(
    () => comparableBuilds.find((item) => item.id === buildId) ?? null,
    [buildId, comparableBuilds]
  );

  const handleAnalyze = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (!buildId) {
        setError('Select a succeeded build before running divergence analysis.');
        setResult(null);
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
        setResult(null);
        return;
      }

      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const data = await getPairDivergence(buildId, {
          recentWindowDays: parsedRecentWindowDays,
          limit: parsedLimit,
          minLongCorrAbs: parsedMinLongCorrAbs,
          minCorrDeltaAbs: parsedMinCorrDeltaAbs
        });

        setResult(data);
        setSearchParams({
          build: buildId,
          recentWindowDays: String(parsedRecentWindowDays),
          limit: String(parsedLimit),
          minLongCorrAbs: String(parsedMinLongCorrAbs),
          minCorrDeltaAbs: String(parsedMinCorrDeltaAbs)
        });
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Divergence analysis failed.');
      } finally {
        setLoading(false);
      }
    },
    [buildId, limit, minCorrDeltaAbs, minLongCorrAbs, recentWindowDays, setSearchParams]
  );

  return (
    <div className="page page--divergence">
      <section className="workspace-hero">
        <div className="workspace-hero__copy">
          <div className="workspace-hero__eyebrow">Pair divergence</div>
          <h1 className="workspace-hero__title">Rank relationship breaks before they disappear inside a full matrix.</h1>
          <p className="workspace-hero__description">
            Screen one build for pairs where recent co-movement and recent return dislocation now
            disagree with the longer-window structure that defined the original artifact.
          </p>
          <div className="workspace-hero__actions">
            <Link to="/compare" className="button button--secondary">
              Compare builds
            </Link>
            <Link to="/builds" className="button button--ghost">
              Browse builds
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
            <div className="workspace-hero__stat-value mono">{selectedBuild ? `${selectedBuild.windowDays}d` : '—'}</div>
            <div className="workspace-hero__stat-label">Long window</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{buildRunsLoading ? '…' : formatInteger(result?.candidateCount ?? 0)}</div>
            <div className="workspace-hero__stat-label">Candidates</div>
          </article>
        </div>
      </section>

      <div className="workspace-layout">
        <div className="workspace-layout__main">
          <Panel variant="primary">
            <SectionHeader
              title="Screen settings"
              subtitle="Use correlation persistence and recent dislocation together so the output is a candidate list, not just a mechanical delta dump."
            />

            {comparableBuilds.length === 0 && !buildRunsLoading ? (
              <div className="state-note state-note--error">
                At least one succeeded build is required before divergence analysis becomes available.
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
                <span className="field__label">Recent window</span>
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
                <span className="field__label">Min |long corr|</span>
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
                <span className="field__label">Min |corr delta|</span>
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
                <span className="field__label">Return limit</span>
                <select
                  className="field__control mono"
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </label>

              <div className="query-form__action query-form__action--stack">
                <button
                  type="submit"
                  className="button button--primary"
                  disabled={loading || !buildId || comparableBuilds.length === 0}
                >
                  {loading ? 'Screening…' : 'Run screen'}
                </button>
              </div>
            </form>

            <div className="filter-summary-row">
              <span className="filter-summary-row__item">Long correlation comes from the stored build artifact.</span>
              <span className="filter-summary-row__item">Recent metrics are recomputed from the shorter aligned price window ending at the build as-of date.</span>
            </div>
          </Panel>

          {error ? (
            <Panel variant="primary">
              <div className="state-note state-note--error">{error}</div>
            </Panel>
          ) : null}

          {result ? <PairDivergenceResult data={result} /> : null}
        </div>

        <div className="workspace-layout__side">
          <Panel variant="utility">
            <SectionHeader
              title="How to read it"
              subtitle="This screen is for pairs that deserve a closer look, not for proving mean reversion on its own."
            />

            <div className="workspace-note-list">
              <div className="workspace-note-list__item">Start with large |corr delta| because that is the primary regime-shift signal.</div>
              <div className="workspace-note-list__item">Use recent relative-return gap to distinguish structural divergence from minor statistical noise.</div>
              <div className="workspace-note-list__item">Use spread z-score as a simple dislocation cue, not as a standalone trading rule.</div>
              <div className="workspace-note-list__item">Sector labels help separate intra-sector unwind from broader cross-sector regime changes.</div>
            </div>
          </Panel>

          <Panel variant="utility">
            <SectionHeader
              title="Current focus"
              subtitle="This first release prioritizes useful ranking and interpretation over chart complexity."
            />

            <div className="workspace-note-list">
              <div className="workspace-note-list__item">Long-window corr</div>
              <div className="workspace-note-list__item">Recent corr</div>
              <div className="workspace-note-list__item">Corr delta</div>
              <div className="workspace-note-list__item">Recent relative-return gap</div>
              <div className="workspace-note-list__item">Spread z-score</div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function PairDivergenceResult({ data }: { data: PairDivergenceResponse }) {
  const strongest = data.candidates[0] ?? null;
  const sameSectorCount = data.candidates.filter((candidate) => candidate.sameSector).length;

  return (
    <Panel variant="primary">
      <SectionHeader
        title="Candidate list"
        subtitle="Ranked first by absolute correlation delta, then by recent return gap and spread dislocation."
      />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">Candidates found</div>
          <div className="stat-card__value mono">{formatInteger(data.candidateCount)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Recent window</div>
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
          <div className="stat-card__label">Top candidate</div>
          <div className="stat-card__value">{strongest ? `${strongest.left} ↔ ${strongest.right}` : '—'}</div>
        </div>
      </div>

      <div className="filter-summary-row">
        <span className="filter-summary-row__item">Thresholds: |long corr| ≥ {formatScore(data.minLongCorrAbs, 2)} and |corr delta| ≥ {formatScore(data.minCorrDeltaAbs, 2)}.</span>
        <span className="filter-summary-row__item">Returned {formatInteger(data.candidates.length)} rows out of {formatInteger(data.candidateCount)} total candidates.</span>
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
                  Long {formatScore(candidate.longWindowCorr, 3)} · Recent {formatScore(candidate.recentCorr, 3)} · Gap {formatPercent(candidate.recentRelativeReturnGap)} · Spread z {formatNullableScore(candidate.spreadZScore)}
                </div>
                <div className="rank-list__meta">
                  {formatSectorLine(candidate)}
                </div>
              </div>
              <span className={`score-pill ${scorePillClassName(candidate.corrDelta)}`}>
                Δ {candidate.corrDelta > 0 ? '+' : ''}{formatScore(candidate.corrDelta, 3)}
              </span>
            </article>
          ))}
        </div>
      ) : (
        <div className="state-note">No candidates matched the current thresholds.</div>
      )}
    </Panel>
  );
}

function formatBuildOption(buildRun: BuildRunListItem): string {
  return `${buildRun.universeId} · ${formatDateOnly(buildRun.asOfDate)} · ${buildRun.windowDays}d · ${buildRun.id.slice(0, 8)}`;
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

function scorePillClassName(corrDelta: number): string {
  if (corrDelta >= 0.15) {
    return 'score-pill--positive';
  }

  if (corrDelta <= -0.15) {
    return 'score-pill--negative';
  }

  return 'score-pill--neutral';
}