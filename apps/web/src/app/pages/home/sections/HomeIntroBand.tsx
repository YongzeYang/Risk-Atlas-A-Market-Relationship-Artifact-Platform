// apps/web/src/app/pages/home/sections/HomeIntroBand.tsx
import { Link } from 'react-router-dom';

import BoundaryNote from '../../../../components/ui/BoundaryNote';
import { formatInteger } from '../../../../lib/format';

type HomeIntroBandProps = {
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

export default function HomeIntroBand({
  exampleLoading,
  comparisonSummary,
  readySnapshotCount,
  universeCount,
  paths,
  exampleSnapshot
}: HomeIntroBandProps) {
  return (
    <section className="hero-band">
      <div className="hero-band__copy">
        <div className="hero-band__eyebrow">Hong Kong market structure research</div>

        <h1 className="hero-band__title">
          See what is really connected before the label catches up.
        </h1>

        <p className="hero-band__description">
          One snapshot reveals hidden overlap, broken relationships, spillover, and hidden groups
          across Hong Kong equities.
        </p>

        <p className="hero-band__subline">
          Useful when a basket looks diversified on paper but still behaves like one crowded idea.
        </p>

        <div className="hero-band__actions">
          <Link to={exampleSnapshot?.to ?? '/builds/new'} className="button button--primary">
            {exampleSnapshot ? 'Open the example snapshot' : 'Create a snapshot'}
          </Link>

          <Link to={paths.compareTo} className="button button--ghost">
            See what changed
          </Link>
        </div>

        <div className="hero-band__support">
          <div className="hero-band__stat-strip">
            <div className="hero-band__stat-pill">
              <span className="mono">{formatInteger(readySnapshotCount)}</span>
              <span>ready snapshots</span>
            </div>

            <div className="hero-band__stat-pill">
              <span className="mono">{formatInteger(universeCount)}</span>
              <span>research baskets</span>
            </div>
          </div>

          <BoundaryNote className="hero-band__disclosure" variant="accent">
            Research support, not direct trading advice.
          </BoundaryNote>
        </div>
      </div>

      <div className="hero-band__spotlight">
        <div className="hero-band__spotlight-label">One snapshot, several reads</div>

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

          <div className="hero-band__route-list">
            <Link to={paths.snapshotTo} className="hero-band__route">
              <div className="hero-band__route-label">Start with</div>
              <div className="hero-band__route-title">Read hidden overlap in the basket</div>
            </Link>

            <Link to={paths.relationshipsTo} className="hero-band__route">
              <div className="hero-band__route-label">Then check</div>
              <div className="hero-band__route-title">Which relationships stopped behaving</div>
            </Link>

            <Link to={paths.spilloverTo} className="hero-band__route">
              <div className="hero-band__route-label">Then trace</div>
              <div className="hero-band__route-title">Who inherits the move from one name</div>
            </Link>
          </div>

          <Link to={paths.compareTo} className="hero-band__compare-card">
            <span className="hero-band__compare-card-label">Follow-up question</span>
            <span className="hero-band__compare-card-title">
              {comparisonSummary
                ? `Compare ${comparisonSummary.scopeLabel} across ${comparisonSummary.leftDate} and ${comparisonSummary.rightDate}.`
                : 'Compare snapshots when the real question is change.'}
            </span>
            {comparisonSummary ? (
              <span className="hero-band__compare-card-meta">{comparisonSummary.lookbackLabel}</span>
            ) : null}
          </Link>
        </div>
      </div>
    </section>
  );
}