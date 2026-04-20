import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import BoundaryNote from '../../../components/ui/BoundaryNote';
import Panel from '../../../components/ui/Panel';
import SectionHeader from '../../../components/ui/SectionHeader';
import { useBuildRunsData } from '../../../features/builds/hooks';
import { useCatalogData } from '../../../features/catalog/hooks';
import {
  describeSnapshotHint,
  pickComparisonBuildPair,
  pickFeaturedBuild
} from '../../../lib/build-run-language';
import { formatDateOnly, formatInteger } from '../../../lib/format';
import { formatLookbackLabel } from '../../../lib/snapshot-language';
import BuildRunsPanel from '../home/sections/BuildRunsPanel';
import type { BuildRunListItem, BuildRunStatus } from '../../../types/api';

type SortMode = 'newest' | 'oldest' | 'asof_desc' | 'window_desc' | 'universe';

export default function BuildsPage() {
  const { buildRuns, loading, refreshing, error, refresh } = useBuildRunsData(3000);
  const { universes } = useCatalogData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BuildRunStatus>('succeeded');
  const [universeFilter, setUniverseFilter] = useState<'all' | string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('asof_desc');

  const universeLabelById = useMemo(
    () => Object.fromEntries(universes.map((item) => [item.id, item.name])),
    [universes]
  );
  const readyBuilds = useMemo(
    () => buildRuns.filter((item) => item.status === 'succeeded'),
    [buildRuns]
  );
  const featuredBuild = useMemo(() => pickFeaturedBuild(readyBuilds), [readyBuilds]);
  const comparisonPair = useMemo(() => pickComparisonBuildPair(readyBuilds), [readyBuilds]);
  const featuredUniverseLabel = featuredBuild
    ? universeLabelById[featuredBuild.universeId] ?? featuredBuild.universeId
    : null;
  const latestReadyDate = useMemo(
    () => [...readyBuilds].sort((left, right) => right.asOfDate.localeCompare(left.asOfDate))[0]?.asOfDate ?? null,
    [readyBuilds]
  );
  const readyBasketCount = new Set(readyBuilds.map((item) => item.universeId)).size;
  const succeededCount = readyBuilds.length;
  const universeOptions = [...new Set(buildRuns.map((item) => item.universeId))].sort();

  const filteredBuilds = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...buildRuns]
      .filter((item) => {
        if (statusFilter !== 'all' && item.status !== statusFilter) {
          return false;
        }

        if (universeFilter !== 'all' && item.universeId !== universeFilter) {
          return false;
        }

        if (!query) {
          return true;
        }

        return [item.id, item.datasetId, item.universeId, item.asOfDate]
          .some((value) => value.toLowerCase().includes(query));
      })
      .sort((left, right) => compareBuildRuns(left, right, sortMode));
  }, [buildRuns, search, statusFilter, universeFilter, sortMode]);

  const comparisonTo = comparisonPair
    ? `/compare?left=${comparisonPair[0].id}&right=${comparisonPair[1].id}`
    : '/compare';

  return (
    <div className="page page--builds">
      <section className="workspace-hero workspace-hero--builds">
        <div className="workspace-hero__copy">
          <div className="workspace-hero__intro">
            <div className="workspace-hero__lead">
              <div className="workspace-hero__eyebrow">Snapshot browser</div>
              <h1 className="workspace-hero__title">Open the finished read that actually answers the basket question.</h1>
              <p className="workspace-hero__description">
                Browse ready market reads first, anchor on one strong snapshot, and only branch into comparison or follow-up analysis when the question truly changes.
              </p>
              <p className="workspace-hero__subline">
                This page is for selection, not interpretation. Pick the strongest finished snapshot, then move into the single page that matches the next research question.
              </p>
            </div>

            <div className="workspace-hero__summary">
              <div className="workspace-hero__summary-label">Quick read</div>
              <div className="workspace-hero__stats">
                <article className="workspace-hero__stat-card">
                  <div className="workspace-hero__stat-value mono">{formatInteger(succeededCount)}</div>
                  <div className="workspace-hero__stat-label">Ready snapshots</div>
                </article>
                <article className="workspace-hero__stat-card">
                  <div className="workspace-hero__stat-value mono">{formatInteger(readyBasketCount)}</div>
                  <div className="workspace-hero__stat-label">Baskets in browser</div>
                </article>
                <article className="workspace-hero__stat-card">
                  <div className="workspace-hero__stat-value mono">
                    {latestReadyDate ? formatDateOnly(latestReadyDate) : '—'}
                  </div>
                  <div className="workspace-hero__stat-label">Latest ready date</div>
                </article>
                <article className={`workspace-hero__stat-card${featuredBuild ? ' workspace-hero__stat-card--highlight' : ''}`}>
                  <div className="workspace-hero__stat-value mono">
                    {featuredBuild ? formatLookbackLabel(featuredBuild.windowDays) : '—'}
                  </div>
                  <div className="workspace-hero__stat-label">Suggested first window</div>
                </article>

                <div className="workspace-hero__stat-note">
                  <strong>Suggested first move:</strong> {featuredUniverseLabel ?? 'Open one finished snapshot'} before comparing dates, lookbacks, or drilling into one name.
                </div>
              </div>
            </div>
          </div>

          <BoundaryNote className="workspace-hero__note" variant="accent">
            One finished snapshot is the base object for What changed, Relationships, Spillover, and Groups.
          </BoundaryNote>
          <div className="workspace-hero__actions">
            <Link
              to={featuredBuild ? `/builds/${featuredBuild.id}` : '/builds/new'}
              className="button button--primary"
            >
              {featuredBuild ? 'Open the suggested snapshot' : 'Create snapshot'}
            </Link>
            <Link to="/series" className="button button--secondary">
              Open snapshot series
            </Link>
            <Link to={comparisonTo} className="button button--ghost">
              Open What changed
            </Link>
          </div>
        </div>
      </section>

      <div className="workspace-layout">
        <div className="workspace-layout__main">
          {featuredBuild && featuredUniverseLabel ? (
            <Panel variant="primary">
              <SectionHeader
                title="Start with a useful result"
                subtitle="If you land here first, anchor on one finished snapshot before scanning the whole ledger."
              />

              <div className="featured-snapshot-card">
                <div className="featured-snapshot-card__eyebrow">Featured snapshot</div>
                <div className="featured-snapshot-card__title">{featuredUniverseLabel}</div>
                <div className="featured-snapshot-card__meta">
                  {formatDateOnly(featuredBuild.asOfDate)} · {formatLookbackLabel(featuredBuild.windowDays)}
                </div>
                <div className="featured-snapshot-card__copy">
                  {describeSnapshotHint(featuredBuild, featuredUniverseLabel)}
                </div>

                <div className="featured-snapshot-card__actions">
                  <Link to={`/builds/${featuredBuild.id}`} className="button button--secondary button--sm">
                    Open snapshot
                  </Link>
                  {comparisonPair ? (
                    <Link to={comparisonTo} className="button button--ghost button--sm">
                      Open what changed
                    </Link>
                  ) : null}
                </div>
              </div>
            </Panel>
          ) : null}

          <Panel variant="utility">
            <SectionHeader
              title="Search snapshots"
              subtitle="Filter by basket, status, date, or lookback. Ready results stay in front so the research signal beats the operational noise."
            />

            <div className="query-form query-form--wide">
              <label className="field">
                <span className="field__label">Search</span>
                <input
                  className="field__control mono"
                  type="text"
                  placeholder="Basket, snapshot date, lookback, or snapshot ID"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>

              <label className="field">
                <span className="field__label">Status</span>
                <select
                  className="field__control mono"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as 'all' | BuildRunStatus)}
                >
                  <option value="all">All</option>
                  <option value="pending">Preparing</option>
                  <option value="running">Running</option>
                  <option value="succeeded">Ready</option>
                  <option value="failed">Failed</option>
                </select>
              </label>

              <label className="field">
                <span className="field__label">Basket</span>
                <select
                  className="field__control mono"
                  value={universeFilter}
                  onChange={(event) => setUniverseFilter(event.target.value)}
                >
                  <option value="all">All baskets</option>
                  {universeOptions.map((option) => (
                    <option key={option} value={option}>
                      {universeLabelById[option] ?? option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field__label">Sort</span>
                <select
                  className="field__control mono"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                >
                  <option value="newest">Newest created</option>
                  <option value="oldest">Oldest created</option>
                  <option value="asof_desc">Newest snapshot date</option>
                  <option value="window_desc">Longest lookback</option>
                  <option value="universe">Basket code</option>
                </select>
              </label>
            </div>

            <div className="filter-summary-row">
              <span className="filter-summary-row__item">Showing {formatInteger(filteredBuilds.length)} of {formatInteger(buildRuns.length)} snapshots.</span>
              <span className="filter-summary-row__item">Default filter is Ready so finished results stay in front of the operational noise.</span>
            </div>
          </Panel>

          <BuildRunsPanel
            buildRuns={filteredBuilds}
            loading={loading}
            refreshing={refreshing}
            error={error}
            onRefresh={refresh}
            universeLabels={universeLabelById}
            title="Browse results"
            subtitle="Open one snapshot for a single read. Use What changed only when the question is cross-snapshot drift."
            emptyStateCopy="No snapshots yet. Create one to populate this history."
          />
        </div>

        <div className="workspace-layout__side">
          <Panel variant="utility">
            <SectionHeader
              title="What this page is for"
              subtitle="Stay in browse mode here: find the right finished read quickly, then leave the ledger and work inside that snapshot."
            />

            <div className="workspace-note-list">
              <div className="workspace-note-list__item">Browse useful finished outputs first.</div>
              <div className="workspace-note-list__item">Open one snapshot when your question is about a single basket.</div>
              <div className="workspace-note-list__item">Use What changed only when you are comparing across snapshots.</div>
            </div>
          </Panel>

          <BoundaryNote title="Quant honesty" variant="accent">
            A ready snapshot is a structured observation, not a prediction. Treat strong relationships, spillover,
            or group structure as clues that deserve context, not as a standalone trade decision.
          </BoundaryNote>

          <Panel variant="utility">
            <SectionHeader
              title="Comparison shortcut"
              subtitle="Only use compare when change, not a single basket read, is the actual research question."
            />

            {comparisonPair ? (
              <div className="latest-build-card">
                <div className="latest-build-card__title">
                  {universeLabelById[comparisonPair[0].universeId] ?? comparisonPair[0].universeId}
                </div>
                <div className="latest-build-card__meta">
                  {formatDateOnly(comparisonPair[0].asOfDate)} ↔ {formatDateOnly(comparisonPair[1].asOfDate)}
                </div>
                <div className="latest-build-card__meta">
                  Start here when you want to see how one basket changed rather than reopen a single result.
                </div>
                <Link to={comparisonTo} className="button button--secondary button--sm">
                  Open what changed
                </Link>
              </div>
            ) : (
              <div className="state-note">Need at least two ready snapshots before comparison becomes useful.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function buildStatusPriority(status: BuildRunStatus): number {
  switch (status) {
    case 'succeeded':
      return 0;
    case 'running':
      return 1;
    case 'pending':
      return 2;
    case 'failed':
    default:
      return 3;
  }
}

function compareBuildRuns(left: BuildRunListItem, right: BuildRunListItem, sortMode: SortMode): number {
  const statusCompare = buildStatusPriority(left.status) - buildStatusPriority(right.status);
  if (statusCompare !== 0) {
    return statusCompare;
  }

  switch (sortMode) {
    case 'oldest':
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    case 'asof_desc': {
      const dateCompare = right.asOfDate.localeCompare(left.asOfDate);
      return dateCompare !== 0 ? dateCompare : new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }
    case 'window_desc': {
      const windowCompare = right.windowDays - left.windowDays;
      return windowCompare !== 0 ? windowCompare : new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }
    case 'universe': {
      const universeCompare = left.universeId.localeCompare(right.universeId);
      return universeCompare !== 0 ? universeCompare : new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }
    case 'newest':
    default:
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  }
}