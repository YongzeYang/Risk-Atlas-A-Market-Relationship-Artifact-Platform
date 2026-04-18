// apps/web/src/app/pages/home/HomePage.tsx
import { Link } from 'react-router-dom';

import { useBuildRunsData, useBuildSeriesData } from '../../../features/builds/hooks';
import { useCatalogData } from '../../../features/catalog/hooks';
import Panel from '../../../components/ui/Panel';
import SectionHeader from '../../../components/ui/SectionHeader';
import BuildRunsPanel from './sections/BuildRunsPanel';
import HomeIntroBand from './sections/HomeIntroBand';

export default function HomePage() {
  const { datasets, universes, loading: catalogLoading, error: catalogError } = useCatalogData();
  const {
    buildRuns,
    loading: buildRunsLoading,
    refreshing: buildRunsRefreshing,
    error: buildRunsError,
    refresh: refreshBuildRuns
  } = useBuildRunsData(3000);
  const { series } = useBuildSeriesData(5000);

  const recentSuccessfulBuilds = buildRuns.filter((item) => item.status === 'succeeded').slice(0, 3);
  const activeSeries = series.filter((item) => item.status === 'pending' || item.status === 'running');
  const dynamicUniverses = universes.filter((item) => item.definitionKind !== 'static');
  const topUniverseLabels = [
    universes.find((item) => item.id === 'hk_top_50_liquid')?.name,
    universes.find((item) => item.id === 'hk_all_common_equity')?.name,
    universes.find((item) => item.id === 'hk_financials')?.name,
    universes.find((item) => item.id === 'hk_tech')?.name
  ].filter((item): item is string => Boolean(item));

  const largestDataset = [...datasets].sort((left, right) => right.symbolCount - left.symbolCount)[0] ?? null;

  return (
    <div className="page page--home">
      <HomeIntroBand
        buildCount={buildRuns.length}
        activeSeriesCount={activeSeries.length}
        datasetCount={datasets.length}
        dynamicUniverseCount={dynamicUniverses.length}
      />

      <section className="home-module-grid">
        <article className="module-card module-card--accent">
          <div className="module-card__eyebrow">Workspace</div>
          <h2 className="module-card__title">Builds</h2>
          <p className="module-card__description">
            Launch new snapshots from curated or dynamic universes, then keep a clean history of
            finished, running, and failed research jobs.
          </p>
          <div className="module-card__meta">Single-build analysis · recent outcomes · detail workspace</div>
          <div className="module-card__actions">
            <Link to="/builds" className="button button--secondary button--sm">
              View builds
            </Link>
            <Link to="/builds/new" className="button button--ghost button--sm">
              New build
            </Link>
          </div>
        </article>

        <article className="module-card">
          <div className="module-card__eyebrow">Rolling research</div>
          <h2 className="module-card__title">Series</h2>
          <p className="module-card__description">
            Treat rolling builds as a first-class workflow with date ranges, frequency controls,
            progress tracking, and one-click access to each child build.
          </p>
          <div className="module-card__meta">{series.length} tracked series · {activeSeries.length} active now</div>
          <div className="module-card__actions">
            <Link to="/series" className="button button--secondary button--sm">
              Open series
            </Link>
          </div>
        </article>

        <article className="module-card">
          <div className="module-card__eyebrow">Structure drift</div>
          <h2 className="module-card__title">Compare</h2>
          <p className="module-card__description">
            Compare builds across time, windows, and universes so drift analysis becomes a guided
            research task rather than a manual build-id exercise.
          </p>
          <div className="module-card__meta">Time vs time · window vs window · universe vs universe</div>
          <div className="module-card__actions">
            <Link to="/compare" className="button button--secondary button--sm">
              Open compare
            </Link>
            <Link to="/divergence" className="button button--ghost button--sm">
              Open divergence
            </Link>
          </div>
        </article>
      </section>

      <div className="home-showcase-grid">
        <BuildRunsPanel
          buildRuns={recentSuccessfulBuilds}
          loading={buildRunsLoading}
          refreshing={buildRunsRefreshing}
          error={buildRunsError}
          onRefresh={refreshBuildRuns}
          title="Recent successful builds"
          subtitle="A short shortlist of ready-to-open results instead of an endless home-page stream."
          emptyStateCopy="No successful builds yet. Start one from the build workspace."
          action={
            <Link to="/builds" className="button button--ghost button--sm">
              View all builds
            </Link>
          }
        />

        <Panel variant="utility" className="coverage-panel">
          <SectionHeader
            title="Research coverage"
            subtitle="Current data and universe foundation, presented as scope rather than a raw catalog dump."
          />

          {catalogLoading ? <div className="state-note">Loading coverage…</div> : null}
          {catalogError ? <div className="state-note state-note--error">{catalogError}</div> : null}

          {!catalogLoading ? (
            <div className="coverage-panel__body">
              <div className="coverage-panel__stat-grid">
                <article className="coverage-stat">
                  <div className="coverage-stat__value mono">{datasets.length}</div>
                  <div className="coverage-stat__label">Datasets</div>
                </article>

                <article className="coverage-stat">
                  <div className="coverage-stat__value mono">{universes.length}</div>
                  <div className="coverage-stat__label">Universes</div>
                </article>

                <article className="coverage-stat">
                  <div className="coverage-stat__value mono">{dynamicUniverses.length}</div>
                  <div className="coverage-stat__label">Dynamic rules</div>
                </article>

                <article className="coverage-stat">
                  <div className="coverage-stat__value mono">{largestDataset?.symbolCount ?? 0}</div>
                  <div className="coverage-stat__label">Max symbols in one dataset</div>
                </article>
              </div>

              <div className="coverage-panel__section">
                <div className="coverage-panel__section-title">Universe types available now</div>
                <div className="coverage-token-list">
                  {topUniverseLabels.map((item) => (
                    <span key={item} className="coverage-token">{item}</span>
                  ))}
                </div>
              </div>

              <div className="coverage-panel__section">
                <div className="coverage-panel__section-title">Next research surfaces already planned for this shell</div>
                <div className="coverage-roadmap">
                  <span className="coverage-roadmap__item">Pair divergence candidates</span>
                  <span className="coverage-roadmap__item">Co-movement exposure</span>
                  <span className="coverage-roadmap__item">Clustered structure view</span>
                </div>
              </div>

              <div className="coverage-panel__section coverage-panel__section--note">
                Largest dataset currently contains {largestDataset?.symbolCount ?? 0} symbols. Dynamic universes such as HK All Common Equities now resolve against the selected dataset, as-of date, and window, so the preflight count reflects coverage-qualified names first and the build pipeline can still drop flat return series before matrix generation.
              </div>
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}