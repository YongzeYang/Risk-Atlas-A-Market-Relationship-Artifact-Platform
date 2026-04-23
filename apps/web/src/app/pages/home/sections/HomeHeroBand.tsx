import { Link } from 'react-router-dom';

import BoundaryNote from '../../../../components/ui/BoundaryNote';
import WorkflowStrip from '../../../../components/ui/WorkflowStrip';
import { buildAnalysisWorkflowItems } from '../../../../lib/analysis-workflow';
import { formatInteger } from '../../../../lib/format';

type HomeHeroBandProps = {
  exampleLoading: boolean;
  comparisonSummary: {
    scopeLabel: string;
    leftDate: string;
    rightDate: string;
    lookbackLabel: string;
  } | null;
  readySnapshotCount: number;
  universeCount: number;
  paths: {
    snapshotTo: string;
    compareTo: string;
    relationshipsTo: string;
    spilloverTo: string;
    groupsTo: string;
  };
  primaryExampleTo: string | null;
  exampleSnapshots: Array<{
    to: string;
    marketLabel: string;
    title: string;
    description: string;
    asOfDate: string;
    lookbackLabel: string;
    scoreTag: string;
  }>;
};

export default function HomeHeroBand({
  exampleLoading,
  comparisonSummary,
  readySnapshotCount,
  universeCount,
  paths,
  primaryExampleTo,
  exampleSnapshots
}: HomeHeroBandProps) {
  const analysisWorkflowItems = buildAnalysisWorkflowItems(null, {
    groupsTo: paths.groupsTo,
    compareTo: paths.compareTo,
    relationshipsTo: paths.relationshipsTo,
    spilloverTo: paths.spilloverTo
  }).map((item) =>
    item.id === 'compare'
      ? {
          ...item,
          description: comparisonSummary
            ? `Compare ${comparisonSummary.scopeLabel} across ${comparisonSummary.leftDate} and ${comparisonSummary.rightDate} once the single-snapshot read is clear.`
            : 'Bring in a second finished read only when the real question is what changed.'
        }
      : item
  );

  return (
    <section className="hero-band">
      <div className="workspace-hero workspace-hero--home hero-band__header">
        <div className="workspace-hero__copy hero-band__copy">
          <div className="workspace-hero__eyebrow hero-band__eyebrow">Hong Kong and crypto market structure research</div>

          <h1 className="workspace-hero__title hero-band__title">
            See what is really connected before the label catches up.
          </h1>

          <p className="workspace-hero__description hero-band__description">
            One snapshot reveals hidden overlap, broken relationships, spillover, and hidden groups
            across Hong Kong equities and crypto markets.
          </p>

          <p className="workspace-hero__subline hero-band__subline">
            Useful when a basket or market looks diversified on paper but still behaves like one crowded idea. Repository baselines refresh every 24 hours, and the latest Hong Kong and crypto snapshots are rebuilt automatically.
          </p>

          <div className="workspace-hero__actions hero-band__actions">
            <Link to={primaryExampleTo ?? '/builds/new'} className="button button--primary">
              {primaryExampleTo ? 'Open the example snapshot' : 'Create a snapshot'}
            </Link>

            <Link to={paths.compareTo} className="button button--ghost">
              See what changed
            </Link>
          </div>

          <div className="workspace-hero__support hero-band__support">
            <div className="workspace-hero__stat-strip hero-band__stat-strip">
              <div className="workspace-hero__stat-pill hero-band__stat-pill">
                <span className="mono">{formatInteger(readySnapshotCount)}</span>
                <span>ready snapshots</span>
              </div>

              <div className="workspace-hero__stat-pill hero-band__stat-pill">
                <span className="mono">{formatInteger(universeCount)}</span>
                <span>research baskets</span>
              </div>
            </div>

            <BoundaryNote className="workspace-hero__note workspace-hero__disclosure hero-band__disclosure" variant="accent">
              Research support, not direct trading advice.
            </BoundaryNote>
          </div>
        </div>

        <div className="workspace-hero__panel hero-band__spotlight">
          <div className="workspace-hero__panel-label hero-band__spotlight-label">Two full-market snapshots</div>

          <div className="hero-band__proof-stack">
            {exampleSnapshots.length > 0 ? (
              exampleSnapshots.slice(0, 2).map((snapshot) => (
                <div key={snapshot.to} className="hero-band__proof-card">
                  <div className="hero-band__proof-topline">
                    <div>
                      <div className="hero-band__proof-kicker">{snapshot.marketLabel}</div>
                      <div className="hero-band__example-title">{snapshot.title}</div>
                    </div>

                    {snapshot.scoreTag ? (
                      <div className="hero-band__example-tag">{snapshot.scoreTag}</div>
                    ) : null}
                  </div>

                  <div className="hero-band__example-meta">
                    {snapshot.asOfDate} · {snapshot.lookbackLabel}
                  </div>

                  <p className="hero-band__spotlight-note hero-band__spotlight-note--compact">
                    {snapshot.description}
                  </p>

                  <div className="hero-band__proof-actions">
                    <Link to={snapshot.to} className="hero-band__proof-link">
                      Open snapshot
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="hero-band__proof-card">
                <div className="hero-band__proof-topline">
                  <div>
                    <div className="hero-band__proof-kicker">Full-market examples</div>
                    <div className="hero-band__example-title">
                      {exampleLoading ? 'Loading guided snapshots' : 'Create the first full-market snapshots'}
                    </div>
                  </div>
                </div>

                <p className="hero-band__spotlight-note">
                  {exampleLoading
                    ? 'Loading the latest Hong Kong and crypto market reads for the homepage spotlight.'
                    : 'The homepage spotlight becomes clearer once one full Hong Kong snapshot and one full crypto snapshot are available.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <WorkflowStrip
        items={analysisWorkflowItems}
        className="hero-band__workflow"
      />
    </section>
  );
}
