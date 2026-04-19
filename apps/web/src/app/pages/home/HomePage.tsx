// apps/web/src/app/pages/home/HomePage.tsx
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import BoundaryNote from '../../../components/ui/BoundaryNote';
import Panel from '../../../components/ui/Panel';
import SectionHeader from '../../../components/ui/SectionHeader';
import { useBuildDetailData, useBuildRunsData } from '../../../features/builds/hooks';
import { useCatalogData } from '../../../features/catalog/hooks';
import { formatDateOnly } from '../../../lib/format';
import {
  describeExampleSnapshotBullets,
  pickComparisonBuildPair,
  pickFeaturedBuild
} from '../../../lib/build-run-language';
import { formatLookbackLabel } from '../../../lib/snapshot-language';
import BuildRunsPanel from './sections/BuildRunsPanel';
import HomeIntroBand from './sections/HomeIntroBand';

export default function HomePage() {
  const {
    universes,
    loading: catalogLoading,
    universesLoading,
    error: catalogError
  } = useCatalogData();
  const {
    buildRuns,
    loading: buildRunsLoading,
    refreshing: buildRunsRefreshing,
    error: buildRunsError,
    refresh: refreshBuildRuns
  } = useBuildRunsData(3000);
  const universeLabelById = useMemo(
    () => Object.fromEntries(universes.map((item) => [item.id, item.name])),
    [universes]
  );
  const readyBuilds = useMemo(
    () => buildRuns.filter((item) => item.status === 'succeeded'),
    [buildRuns]
  );
  const exampleBuild = useMemo(() => pickFeaturedBuild(readyBuilds), [readyBuilds]);
  const comparisonPair = useMemo(() => pickComparisonBuildPair(readyBuilds), [readyBuilds]);
  const comparisonTo = comparisonPair
    ? `/compare?left=${comparisonPair[0].id}&right=${comparisonPair[1].id}`
    : '/compare';
  const recentSuccessfulBuilds = useMemo(() => {
    if (!exampleBuild) {
      return readyBuilds.slice(0, 3);
    }

    return [exampleBuild, ...readyBuilds.filter((item) => item.id !== exampleBuild.id)].slice(0, 3);
  }, [exampleBuild, readyBuilds]);
  const topUniverseLabels = [
    universes.find((item) => item.id === 'hk_top_50_liquid')?.name,
    universes.find((item) => item.id === 'hk_all_common_equity')?.name,
    universes.find((item) => item.id === 'hk_financials')?.name,
    universes.find((item) => item.id === 'hk_tech')?.name
  ].filter((item): item is string => Boolean(item));
  const { detail: exampleDetail } = useBuildDetailData(exampleBuild?.id, 10000);
  const showCatalogSkeleton = catalogLoading && universes.length === 0;
  const exampleSnapshot = useMemo(() => {
    if (!exampleBuild) {
      return null;
    }

    const universeLabel = universeLabelById[exampleBuild.universeId] ?? exampleBuild.universeId;
    const topPair = exampleDetail?.topPairs[0];
    const topPairLabel = topPair ? `${topPair.left} and ${topPair.right}` : null;

    return {
      to: `/builds/${exampleBuild.id}`,
      universeLabel,
      asOfDate: formatDateOnly(exampleBuild.asOfDate),
      lookbackLabel: formatLookbackLabel(exampleBuild.windowDays),
      insights: describeExampleSnapshotBullets(
        exampleBuild,
        universeLabel,
        topPairLabel,
        exampleDetail?.symbolCount
      )
    };
  }, [exampleBuild, exampleDetail?.symbolCount, exampleDetail?.topPairs, universeLabelById]);

  const questionCards = [
    {
      eyebrow: 'Best first click',
      title: 'Am I actually diversified?',
      description: 'See where a basket is more concentrated than it looks.',
      actionLabel: exampleBuild ? 'Start with this read' : 'Browse snapshots',
      to: exampleBuild ? `/builds/${exampleBuild.id}` : '/builds'
    },
    {
      eyebrow: 'Relationships',
      title: 'Which relationships just broke?',
      description: 'Find pairs that used to move together more closely than they do now.',
      actionLabel: exampleBuild ? 'Check the drift view' : 'Open relationships',
      to: exampleBuild ? `/divergence?build=${exampleBuild.id}` : '/divergence'
    },
    {
      eyebrow: 'Spillover',
      title: 'If this stock drops, who tends to move with it?',
      description: 'Explore historical co-movement around one name.',
      actionLabel: exampleBuild ? 'Open spillover' : 'Open spillover',
      to: exampleBuild ? `/exposure?build=${exampleBuild.id}` : '/exposure'
    },
    {
      eyebrow: 'Groups',
      title: 'What hidden groups exist in the market?',
      description: 'Find names that behave alike, even when the label says otherwise.',
      actionLabel: exampleBuild ? 'Open hidden groups' : 'Open groups',
      to: exampleBuild ? `/structure?build=${exampleBuild.id}` : '/structure'
    },
    {
      eyebrow: 'Compare',
      title: 'What changed?',
      description: 'Compare two snapshots across time, lookback, or basket.',
      actionLabel: comparisonPair ? 'Compare snapshots' : 'Open what changed',
      to: comparisonTo
    }
  ];

  return (
    <div className="page page--home">
      <HomeIntroBand comparisonTo={comparisonTo} exampleSnapshot={exampleSnapshot} />

      <section className="home-question-section">
        <div className="home-question-section__intro">
          <SectionHeader
            title="Start with one question"
            subtitle="Each question opens a different read on the same snapshot."
          />

          <div className="home-question-section__note">
            <div className="home-question-section__note-label">New here?</div>
            <div className="home-question-section__note-copy">
              Open the example snapshot above first if you want the quickest feel for the product.
              Use these question paths once you know what you want to inspect next.
            </div>
          </div>
        </div>

        <div className="home-question-grid">
          {questionCards.map((item, index) => (
            <Link
              key={item.title}
              to={item.to}
              className={`home-question-card${index === 0 ? ' home-question-card--primary' : ''}`}
            >
              <div className="home-question-card__eyebrow">{item.eyebrow}</div>
              <div className="home-question-card__title">{item.title}</div>
              <div className="home-question-card__description">{item.description}</div>
              <div className="home-question-card__action">{item.actionLabel}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="how-to-steps">
        <article className="how-to-step">
          <div className="how-to-step__number">Step 1</div>
          <div className="how-to-step__title">Open one snapshot</div>
          <div className="how-to-step__copy">Start with a ready example so you can see one clean market read immediately.</div>
        </article>
        <article className="how-to-step">
          <div className="how-to-step__number">Step 2</div>
          <div className="how-to-step__title">Read the basket</div>
          <div className="how-to-step__copy">Explore diversification, relationships, spillover, and groups — all from the same snapshot.</div>
        </article>
        <article className="how-to-step">
          <div className="how-to-step__number">Step 3</div>
          <div className="how-to-step__title">Compare snapshots</div>
          <div className="how-to-step__copy">Compare across time, lookback, or basket when your real question is what changed.</div>
        </article>
      </section>

      <div className="home-showcase-grid">
        <BuildRunsPanel
          buildRuns={recentSuccessfulBuilds}
          loading={buildRunsLoading}
          refreshing={buildRunsRefreshing}
          error={buildRunsError}
          onRefresh={refreshBuildRuns}
          universeLabels={universeLabelById}
          title="Start from a ready snapshot"
          subtitle="These finished snapshots are the fastest way to understand what the product gives you."
          emptyStateCopy="No ready snapshots yet. Create one to start reading the market."
          action={
            <Link to="/builds" className="button button--ghost button--sm">
              View all snapshots
            </Link>
          }
        />

        <Panel variant="utility" className="coverage-panel">
          <SectionHeader
            title="What you can explore right now"
            subtitle="Stable capabilities in this release, without leaning on fragile live counters."
          />

          {showCatalogSkeleton ? <div className="state-note">Loading coverage…</div> : null}
          {catalogError ? <div className="state-note state-note--error">{catalogError}</div> : null}

          {!showCatalogSkeleton ? (
            <div className="coverage-panel__body">
              <div className="coverage-panel__section">
                <div className="coverage-panel__section-title">Start with baskets like</div>
                {universesLoading && topUniverseLabels.length === 0 ? <div className="state-note">Loading baskets…</div> : null}
                {topUniverseLabels.length > 0 ? (
                  <div className="coverage-token-list">
                    {topUniverseLabels.map((item) => (
                      <span key={item} className="coverage-token">{item}</span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="coverage-panel__section">
                <div className="coverage-panel__section-title">Use one snapshot for</div>
                <div className="coverage-roadmap">
                  <span className="coverage-roadmap__item">Single-snapshot reading</span>
                  <span className="coverage-roadmap__item">Relationships worth a closer look</span>
                  <span className="coverage-roadmap__item">Spillover reads</span>
                  <span className="coverage-roadmap__item">Hidden-group discovery</span>
                  <span className="coverage-roadmap__item">What changed</span>
                </div>
              </div>

              <BoundaryNote variant="accent">
                Co-movement is a historical pattern, not causality. Use one snapshot as research support, then compare only when your real question is change.
              </BoundaryNote>
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}