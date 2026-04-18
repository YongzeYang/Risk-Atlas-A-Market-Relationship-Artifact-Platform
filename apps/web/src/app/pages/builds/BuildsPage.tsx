import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import Panel from '../../../components/ui/Panel';
import SectionHeader from '../../../components/ui/SectionHeader';
import { useBuildRunsData } from '../../../features/builds/hooks';
import { formatDateOnly, formatInteger } from '../../../lib/format';
import BuildRunsPanel from '../home/sections/BuildRunsPanel';
import type { BuildRunListItem, BuildRunStatus } from '../../../types/api';

type SortMode = 'newest' | 'oldest' | 'asof_desc' | 'window_desc' | 'universe';

export default function BuildsPage() {
  const { buildRuns, loading, refreshing, error, refresh } = useBuildRunsData(3000);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BuildRunStatus>('all');
  const [universeFilter, setUniverseFilter] = useState<'all' | string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  const runningCount = buildRuns.filter((item) => item.status === 'running').length;
  const queuedCount = buildRuns.filter((item) => item.status === 'pending').length;
  const succeededCount = buildRuns.filter((item) => item.status === 'succeeded').length;
  const comparableCount = buildRuns.filter((item) => item.status === 'succeeded').length;
  const latestBuild = buildRuns[0] ?? null;
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

  return (
    <div className="page page--builds">
      <section className="workspace-hero">
        <div className="workspace-hero__copy">
          <div className="workspace-hero__eyebrow">Build workspace</div>
          <h1 className="workspace-hero__title">Browse every build in a dedicated research workspace.</h1>
          <p className="workspace-hero__description">
            Keep creation, history, and analysis entry points separate so the platform can scale to
            more research modules without collapsing back into a single cluttered home page.
          </p>
          <div className="workspace-hero__actions">
            <Link to="/builds/new" className="button button--primary">
              New build
            </Link>
            <Link to="/compare" className="button button--secondary">
              Compare builds
            </Link>
          </div>
        </div>

        <div className="workspace-hero__stats">
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{buildRuns.length}</div>
            <div className="workspace-hero__stat-label">Total builds</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{runningCount}</div>
            <div className="workspace-hero__stat-label">Running</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{queuedCount}</div>
            <div className="workspace-hero__stat-label">Queued</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{succeededCount}</div>
            <div className="workspace-hero__stat-label">Succeeded</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{comparableCount}</div>
            <div className="workspace-hero__stat-label">Comparable builds</div>
          </article>
        </div>
      </section>

      <div className="workspace-layout">
        <div className="workspace-layout__main">
          <Panel variant="utility">
            <SectionHeader
              title="Filter and sort"
              subtitle="Frontend filtering is enough for the current build volume, so backend pagination is not required yet."
            />

            <div className="query-form query-form--wide">
              <label className="field">
                <span className="field__label">Search</span>
                <input
                  className="field__control mono"
                  type="text"
                  placeholder="Build id, dataset, universe, or date"
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
                  <option value="pending">Pending</option>
                  <option value="running">Running</option>
                  <option value="succeeded">Succeeded</option>
                  <option value="failed">Failed</option>
                </select>
              </label>

              <label className="field">
                <span className="field__label">Universe</span>
                <select
                  className="field__control mono"
                  value={universeFilter}
                  onChange={(event) => setUniverseFilter(event.target.value)}
                >
                  <option value="all">All universes</option>
                  {universeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
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
                  <option value="asof_desc">Newest as-of date</option>
                  <option value="window_desc">Largest window</option>
                  <option value="universe">Universe id</option>
                </select>
              </label>
            </div>

            <div className="filter-summary-row">
              <span className="filter-summary-row__item">Showing {formatInteger(filteredBuilds.length)} of {formatInteger(buildRuns.length)} builds.</span>
              <span className="filter-summary-row__item">Current scale does not justify a dedicated server-side filter API yet.</span>
            </div>
          </Panel>

          <BuildRunsPanel
            buildRuns={filteredBuilds}
            loading={loading}
            refreshing={refreshing}
            error={error}
            onRefresh={refresh}
            title="Build history"
            subtitle="A filtered build history workspace instead of a raw stream bolted onto the homepage."
            emptyStateCopy="No builds yet. Start a new build to populate this workspace."
          />
        </div>

        <div className="workspace-layout__side">
          <Panel variant="utility">
            <SectionHeader
              title="What this page is for"
              subtitle="A dedicated build history page keeps the homepage focused on product value and recent outcomes."
            />

            <div className="workspace-note-list">
              <div className="workspace-note-list__item">Use this page to monitor queued or running builds.</div>
              <div className="workspace-note-list__item">Jump into any build detail as soon as the run is created.</div>
              <div className="workspace-note-list__item">Use compare when you want drift analysis rather than single-run inspection.</div>
              <div className="workspace-note-list__item">Client-side filtering is enough for the current history size, so backend pagination can wait until the build volume is materially larger.</div>
            </div>
          </Panel>

          <Panel variant="utility">
            <SectionHeader
              title="Latest build"
              subtitle="Quick context for the newest item in the queue."
            />

            {latestBuild ? (
              <div className="latest-build-card">
                <div className="latest-build-card__title mono">{latestBuild.universeId}</div>
                <div className="latest-build-card__meta">
                  {formatDateOnly(latestBuild.asOfDate)} · {latestBuild.windowDays}-day window
                </div>
                <div className="latest-build-card__meta mono">{latestBuild.id}</div>
                <Link to={`/builds/${latestBuild.id}`} className="button button--secondary button--sm">
                  Open latest build
                </Link>
              </div>
            ) : (
              <div className="state-note">No build history yet.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function compareBuildRuns(left: BuildRunListItem, right: BuildRunListItem, sortMode: SortMode): number {
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