// apps/web/src/app/pages/home/HomePage.tsx
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import BoundaryNote from '../../../components/ui/BoundaryNote';
import { useBuildDetailData, useBuildRunsData } from '../../../features/builds/hooks';
import { useCatalogData } from '../../../features/catalog/hooks';
import { formatDateOnly, formatInteger } from '../../../lib/format';
import {
  describeExampleSnapshotBullets,
  pickComparisonBuildPair,
  pickFeaturedBuild
} from '../../../lib/build-run-language';
import { formatLookbackLabel } from '../../../lib/snapshot-language';
import HomeIntroBand from './sections/HomeIntroBand';

export default function HomePage() {
  const {
    universes,
    loading: catalogLoading,
    error: catalogError
  } = useCatalogData();
  const {
    buildRuns,
    loading: buildRunsLoading,
    error: buildRunsError
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
  const comparisonSummary = useMemo(() => {
    if (!comparisonPair) {
      return null;
    }

    const [left, right] = comparisonPair;
    const leftUniverseLabel = universeLabelById[left.universeId] ?? left.universeId;
    const rightUniverseLabel = universeLabelById[right.universeId] ?? right.universeId;

    return {
      scopeLabel:
        left.universeId === right.universeId
          ? leftUniverseLabel
          : `${leftUniverseLabel} vs ${rightUniverseLabel}`,
      leftDate: formatDateOnly(left.asOfDate),
      rightDate: formatDateOnly(right.asOfDate),
      lookbackLabel:
        left.windowDays === right.windowDays
          ? formatLookbackLabel(left.windowDays)
          : `${formatLookbackLabel(left.windowDays)} vs ${formatLookbackLabel(right.windowDays)}`
    };
  }, [comparisonPair, universeLabelById]);
  const preferredUniverseLabels = [
    universes.find((item) => item.id === 'hk_top_50_liquid')?.name,
    universes.find((item) => item.id === 'hk_all_common_equity')?.name,
    universes.find((item) => item.id === 'hk_financials')?.name,
    universes.find((item) => item.id === 'hk_tech')?.name
  ].filter((item): item is string => Boolean(item));
  const topUniverseLabels =
    preferredUniverseLabels.length > 0
      ? preferredUniverseLabels
      : universes.slice(0, 4).map((item) => item.name);
  const { detail: exampleDetail } = useBuildDetailData(exampleBuild?.id, 10000);
  const showCatalogSkeleton = catalogLoading && universes.length === 0;
  const exampleSymbolCount = exampleDetail?.symbolCount ?? exampleDetail?.symbolOrder.length ?? null;
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
      symbolCount: exampleSymbolCount,
      topPairLabel,
      insights: describeExampleSnapshotBullets(
        exampleBuild,
        universeLabel,
        topPairLabel,
        exampleSymbolCount
      )
    };
  }, [exampleBuild, exampleDetail?.topPairs, exampleSymbolCount, universeLabelById]);
  const guidedPaths = {
    snapshotTo: exampleSnapshot?.to ?? '/builds',
    compareTo: comparisonTo,
    relationshipsTo: exampleBuild ? `/divergence?build=${exampleBuild.id}` : '/divergence',
    spilloverTo: exampleBuild ? `/exposure?build=${exampleBuild.id}` : '/exposure',
    groupsTo: exampleBuild ? `/structure?build=${exampleBuild.id}` : '/structure'
  };

  return (
    <div className="page page--home">
      <HomeIntroBand
        exampleLoading={buildRunsLoading}
        exampleSnapshot={exampleSnapshot}
        comparisonSummary={comparisonSummary}
        readySnapshotCount={readyBuilds.length}
        universeCount={universes.length}
        paths={guidedPaths}
      />

      <section className="home-story-section">
        <div className="home-section-heading">
          <div className="home-section-heading__kicker">What the platform helps you see</div>
          <h2 className="home-section-heading__title">
            Diversification can look healthy and still hide one crowded structure.
          </h2>
          <p className="home-section-heading__copy">
            Start from the basket, not the story around it. One finished snapshot tells you whether
            the names are actually spreading risk, drifting apart, or clustering more tightly than
            the label suggests.
          </p>
        </div>

        <div className="home-story-grid">
          <article className="home-editorial-card home-editorial-card--feature">
            <div className="home-editorial-card__eyebrow">Hidden concentration</div>
            <h3 className="home-editorial-card__title">
              Sector labels tell you what a basket owns. Not how it behaves.
            </h3>
            <p className="home-editorial-card__copy">
              The first read is a structure read: where overlap bunches up, where hidden exposure
              lives, and where the holdings list is flatter than the risk underneath it.
            </p>

            <ul className="home-editorial-card__list">
              <li>Start from the basket before you explain any pair.</li>
              <li>Measure concentration the label does not admit.</li>
              <li>Use one snapshot as the baseline for every follow-on read.</li>
            </ul>

            <div className="home-editorial-card__footer">
              <Link to={exampleSnapshot?.to ?? '/builds'} className="home-inline-link">
                Start with the basket read
              </Link>
            </div>
          </article>

          <article className="home-editorial-card home-editorial-card--signal">
            <div className="home-editorial-card__eyebrow">Relationship drift</div>
            <h3 className="home-editorial-card__title">
              See the break before consensus updates.
            </h3>
            <p className="home-editorial-card__copy">
              When two names stop travelling together, the old shortcut becomes dangerous. Compare
              snapshots and scan drift before the market story fully rewrites itself.
            </p>

            <div className="home-editorial-card__meta">
              Best when the narrative still assumes the old relationship holds.
            </div>

            <div className="home-editorial-card__action-row">
              <Link to={guidedPaths.compareTo} className="home-inline-link">
                What changed
              </Link>
              <Link to={guidedPaths.relationshipsTo} className="home-inline-link">
                Scan drift
              </Link>
            </div>
          </article>

          <article className="home-editorial-card home-editorial-card--signal">
            <div className="home-editorial-card__eyebrow">Spillover map</div>
            <h3 className="home-editorial-card__title">
              Find who inherits the move.
            </h3>
            <p className="home-editorial-card__copy">
              Start from one name, then trace the neighbors and clusters that keep transmitting the
              same pressure through the rest of the basket.
            </p>

            <div className="home-editorial-card__meta">
              Best when one stock or pocket of the market starts setting the tone for everything
              nearby.
            </div>

            <div className="home-editorial-card__action-row">
              <Link to={guidedPaths.spilloverTo} className="home-inline-link">
                Open spillover
              </Link>
              <Link to={guidedPaths.groupsTo} className="home-inline-link">
                View groups
              </Link>
            </div>
          </article>
        </div>
      </section>

      <section className="home-proof-section">
        <div className="home-section-heading home-section-heading--split">
          <div>
            <div className="home-section-heading__kicker">Open one finished read</div>
            <h2 className="home-section-heading__title">
              The product becomes obvious when one strong snapshot carries the story.
            </h2>
            <p className="home-section-heading__copy">
              Use a curated snapshot to learn the grammar of the platform first. Build your own
              once you know which basket and which question matter.
            </p>
          </div>

          <div className="home-section-heading__aside">
            Recommended first passes: Top 50 Liquid, full market, financials, and tech.
          </div>
        </div>

        <div className="home-proof-grid">
          <article className="home-proof-panel home-proof-panel--featured">
            <div className="home-proof-panel__eyebrow">Curated first read</div>

            {exampleSnapshot ? (
              <>
                <div className="home-proof-panel__title-row">
                  <h3 className="home-proof-panel__title">{exampleSnapshot.universeLabel}</h3>
                  <div className="home-proof-panel__scope">
                    {exampleSnapshot.asOfDate} · {exampleSnapshot.lookbackLabel}
                  </div>
                </div>

                <div className="home-proof-panel__stats">
                  <div className="home-proof-stat">
                    <div className="home-proof-stat__value mono">
                      {exampleSnapshot.symbolCount != null ? formatInteger(exampleSnapshot.symbolCount) : '—'}
                    </div>
                    <div className="home-proof-stat__label">names resolved</div>
                  </div>

                  <div className="home-proof-stat">
                    <div className="home-proof-stat__value">
                      {exampleSnapshot.topPairLabel ?? 'Ready when the detail loads'}
                    </div>
                    <div className="home-proof-stat__label">closest relationship</div>
                  </div>
                </div>

                <ul className="home-proof-panel__list">
                  {exampleSnapshot.insights.slice(0, 2).map((insight) => (
                    <li key={insight}>{insight}</li>
                  ))}
                </ul>

                {comparisonSummary ? (
                  <Link to={guidedPaths.compareTo} className="home-proof-follow-on">
                    <span className="home-proof-follow-on__label">Next move</span>
                    <span className="home-proof-follow-on__title">
                      Compare {comparisonSummary.scopeLabel} across {comparisonSummary.leftDate} and {comparisonSummary.rightDate}.
                    </span>
                    <span className="home-proof-follow-on__meta">
                      {comparisonSummary.lookbackLabel}
                    </span>
                  </Link>
                ) : null}

                <div className="home-proof-panel__actions">
                  <Link to={exampleSnapshot.to} className="button button--primary">
                    Open this snapshot
                  </Link>
                  <Link to={guidedPaths.compareTo} className="button button--secondary">
                    Compare snapshots
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h3 className="home-proof-panel__title">
                  {buildRunsLoading ? 'Loading the guided snapshot…' : 'No guided snapshot is ready yet'}
                </h3>
                <p className="home-proof-panel__copy">
                  {buildRunsLoading
                    ? 'Fetching finished snapshots so the homepage can anchor on a real product proof.'
                    : 'Create one clean snapshot first, then the homepage can use it as the guided first read.'}
                </p>

                <div className="home-proof-panel__actions">
                  <Link to="/builds/new" className="button button--primary">
                    Create a snapshot
                  </Link>
                  <Link to="/builds" className="button button--ghost">
                    Browse snapshots
                  </Link>
                </div>
              </>
            )}
          </article>

          <aside className="home-proof-panel home-proof-panel--rail">
            {buildRunsError ? <div className="state-note state-note--error">{buildRunsError}</div> : null}
            {catalogError ? <div className="state-note state-note--error">{catalogError}</div> : null}

            <div className="home-proof-panel__block">
              <div className="home-proof-panel__block-label">Start with baskets like</div>

              {showCatalogSkeleton ? <div className="state-note">Loading baskets…</div> : null}

              {topUniverseLabels.length > 0 ? (
                <div className="home-proof-token-list">
                  {topUniverseLabels.map((item) => (
                    <span key={item} className="home-proof-token">{item}</span>
                  ))}
                </div>
              ) : null}

              {!showCatalogSkeleton && topUniverseLabels.length === 0 ? (
                <p className="home-proof-panel__copy">
                  Add a few curated baskets here so the homepage feels broader than one example.
                </p>
              ) : null}
            </div>

            <div className="home-proof-panel__block">
              <div className="home-proof-panel__block-label">Use one snapshot to</div>
              <div className="home-proof-route-list">
                <Link to={guidedPaths.snapshotTo} className="home-proof-route">
                  <span className="home-proof-route__label">Basket read</span>
                  <span className="home-proof-route__title">Read hidden overlap</span>
                </Link>
                <Link to={guidedPaths.relationshipsTo} className="home-proof-route">
                  <span className="home-proof-route__label">Drift scan</span>
                  <span className="home-proof-route__title">Inspect broken relationships</span>
                </Link>
                <Link to={guidedPaths.spilloverTo} className="home-proof-route">
                  <span className="home-proof-route__label">Spillover</span>
                  <span className="home-proof-route__title">Trace who inherits the move</span>
                </Link>
                <Link to={guidedPaths.groupsTo} className="home-proof-route">
                  <span className="home-proof-route__label">Groups</span>
                  <span className="home-proof-route__title">Reveal hidden clusters</span>
                </Link>
              </div>
            </div>

            <BoundaryNote className="home-proof-panel__note" variant="accent">
              Co-movement is a historical pattern, not causality. Start with one snapshot for
              structure, then compare only when your real question is change.
            </BoundaryNote>
          </aside>
        </div>
      </section>

      <section className="home-cta-band">
        <div className="home-cta-band__copy">
          <div className="home-cta-band__eyebrow">Fastest first move</div>
          <h2 className="home-cta-band__title">
            Open the guided snapshot first.
          </h2>
          <p className="home-cta-band__description">
            If the example makes sense, your own build will make more sense too.
          </p>
        </div>

        <div className="home-cta-band__actions">
          <Link to={exampleSnapshot?.to ?? '/builds/new'} className="button button--primary">
            {exampleSnapshot ? 'Open the example snapshot' : 'Create a snapshot'}
          </Link>
          <Link to="/builds" className="button button--ghost">
            Browse all snapshots
          </Link>
        </div>
      </section>
    </div>
  );
}