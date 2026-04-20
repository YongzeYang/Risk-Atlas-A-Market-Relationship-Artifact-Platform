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
  exampleSnapshot: {
    to: string;
    universeLabel: string;
    asOfDate: string;
    lookbackLabel: string;
    symbolCount: number | null;
    topPairLabel: string | null;
    insights: string[];
  } | null;
};

export default function HomeHeroBand({
  exampleLoading,
  comparisonSummary,
  readySnapshotCount,
  universeCount,
  paths,
  exampleSnapshot
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
          <div className="workspace-hero__eyebrow hero-band__eyebrow">Hong Kong market structure research</div>

          <h1 className="workspace-hero__title hero-band__title">
            See what is really connected before the label catches up.
          </h1>

          <p className="workspace-hero__description hero-band__description">
            One snapshot reveals hidden overlap, broken relationships, spillover, and hidden groups
            across Hong Kong equities.
          </p>

          <p className="workspace-hero__subline hero-band__subline">
            Useful when a basket looks diversified on paper but still behaves like one crowded idea.
          </p>

          <div className="workspace-hero__actions hero-band__actions">
            <Link to={exampleSnapshot?.to ?? '/builds/new'} className="button button--primary">
              {exampleSnapshot ? 'Open the example snapshot' : 'Create a snapshot'}
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
          <div className="workspace-hero__panel-label hero-band__spotlight-label">One snapshot, then the next question</div>

          <div className="hero-band__proof-stack">
            <div className="hero-band__proof-card">
              <div className="hero-band__proof-topline">
                <div>
                  <div className="hero-band__proof-kicker">Featured snapshot</div>
                  <div className="hero-band__example-title">
                    {exampleSnapshot
                      ? exampleSnapshot.universeLabel
                      : exampleLoading
                        ? 'Loading guided snapshot'
                        : 'Create the first guided snapshot'}
                  </div>
                </div>

                <div className="hero-band__example-tag">
                  {exampleSnapshot ? 'Guided read' : exampleLoading ? 'Loading' : 'Setup needed'}
                </div>
              </div>

              <div className="hero-band__example-meta">
                {exampleSnapshot
                  ? `${exampleSnapshot.asOfDate} · ${exampleSnapshot.lookbackLabel}`
                  : 'The homepage works best when it can anchor on one finished market read.'}
              </div>

              {exampleSnapshot ? (
                <>
                  <div className="hero-band__proof-stats">
                    <div className="hero-band__proof-stat">
                      <div className="hero-band__proof-stat-value mono">
                        {exampleSnapshot.symbolCount != null
                          ? formatInteger(exampleSnapshot.symbolCount)
                          : '—'}
                      </div>
                      <div className="hero-band__proof-stat-label">names</div>
                    </div>

                    <div className="hero-band__proof-stat">
                      <div className="hero-band__proof-stat-value">
                        {exampleSnapshot.topPairLabel ?? 'Detail ready after load'}
                      </div>
                      <div className="hero-band__proof-stat-label">closest relationship</div>
                    </div>
                  </div>

                  <ul className="hero-band__example-list">
                    {exampleSnapshot.insights.slice(0, 2).map((insight) => (
                      <li key={insight}>{insight}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="hero-band__spotlight-note">
                  Start with one clean snapshot so the homepage can show a real product proof instead
                  of a generic dashboard list.
                </p>
              )}
            </div>
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
