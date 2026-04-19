// apps/web/src/app/pages/home/sections/HomeIntroBand.tsx
import { Link } from 'react-router-dom';

import BoundaryNote from '../../../../components/ui/BoundaryNote';

type HomeIntroBandProps = {
  comparisonTo: string;
  exampleSnapshot: {
    to: string;
    universeLabel: string;
    asOfDate: string;
    lookbackLabel: string;
    insights: string[];
  } | null;
};

export default function HomeIntroBand({
  comparisonTo,
  exampleSnapshot
}: HomeIntroBandProps) {
  return (
    <section className="hero-band">
      <div className="hero-band__copy">
        <h1 className="hero-band__title">
          See through fake diversification in Hong Kong stocks.
        </h1>

        <p className="hero-band__description">
          Risk Atlas helps you spot hidden overlap, broken relationships, names that tend to move
          together, and what changed across snapshots.
        </p>

        <BoundaryNote variant="accent">
          Research support, not direct trading advice.
        </BoundaryNote>

        <div className="hero-band__actions">
          <Link
            to={exampleSnapshot?.to ?? '/builds/new'}
            className="button button--primary"
          >
            {exampleSnapshot ? 'Open an example snapshot' : 'Create a snapshot'}
          </Link>

          {exampleSnapshot ? (
            <Link to="/builds/new" className="button button--secondary">
              Create a snapshot
            </Link>
          ) : null}

          <Link to={comparisonTo} className="button button--ghost">
            Open what changed
          </Link>

          <Link to="/builds" className="button button--ghost">
            Browse snapshots
          </Link>
        </div>
      </div>

      <div className="hero-band__spotlight">
        <div className="hero-band__spotlight-label">What this looks like in practice</div>

        {exampleSnapshot ? (
          <div className="hero-band__example-card">
            <div className="hero-band__example-tag">Example snapshot</div>
            <div className="hero-band__example-title">{exampleSnapshot.universeLabel}</div>
            <div className="hero-band__example-meta">
              {exampleSnapshot.asOfDate} · {exampleSnapshot.lookbackLabel}
            </div>

            <ul className="hero-band__example-list">
              {exampleSnapshot.insights.map((insight) => (
                <li key={insight}>{insight}</li>
              ))}
            </ul>

            <Link to={exampleSnapshot.to} className="button button--secondary">
              Open this snapshot
            </Link>
          </div>
        ) : (
          <div className="hero-band__example-card">
            <div className="hero-band__example-title">No ready example yet</div>
            <div className="hero-band__example-meta">
              Create one clean snapshot first, then come back here to use it as the guided example.
            </div>
            <Link to="/builds/new" className="button button--secondary">
              Create a snapshot
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}