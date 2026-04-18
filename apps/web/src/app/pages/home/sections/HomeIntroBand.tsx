// apps/web/src/app/pages/home/sections/HomeIntroBand.tsx
import { Link } from 'react-router-dom';

type HomeIntroBandProps = {
  buildCount: number;
  activeSeriesCount: number;
  datasetCount: number;
  dynamicUniverseCount: number;
};

export default function HomeIntroBand({
  buildCount,
  activeSeriesCount,
  datasetCount,
  dynamicUniverseCount
}: HomeIntroBandProps) {
  return (
    <section className="hero-band">
      <div className="hero-band__copy">
        <div className="hero-band__eyebrow">Hong Kong correlation research workspace</div>

        <h1 className="hero-band__title">
          Research rolling co-movement across HK universes without dumping every workflow onto one page.
        </h1>

        <p className="hero-band__description">
          Build single snapshots, run rolling series, and compare structure drift across dates,
          windows, and universes from a workspace designed for research rather than demo clutter.
        </p>

        <div className="hero-band__actions">
          <Link to="/builds/new" className="button button--primary">
            Start a new build
          </Link>

          <Link to="/builds" className="button button--secondary">
            Explore builds
          </Link>
        </div>
      </div>

      <div className="hero-band__spotlight">
        <div className="hero-band__spotlight-label">Live workspace</div>

        <div className="hero-band__metric-grid">
          <article className="hero-band__metric-card">
            <div className="hero-band__metric-value mono">{buildCount}</div>
            <div className="hero-band__metric-label">Builds tracked</div>
          </article>

          <article className="hero-band__metric-card">
            <div className="hero-band__metric-value mono">{activeSeriesCount}</div>
            <div className="hero-band__metric-label">Active series</div>
          </article>

          <article className="hero-band__metric-card">
            <div className="hero-band__metric-value mono">{datasetCount}</div>
            <div className="hero-band__metric-label">Datasets</div>
          </article>

          <article className="hero-band__metric-card">
            <div className="hero-band__metric-value mono">{dynamicUniverseCount}</div>
            <div className="hero-band__metric-label">Dynamic universes</div>
          </article>
        </div>

        <div className="hero-band__spotlight-note">
          Current scope: HK large-universe research foundation with rolling builds, dynamic universes,
          and build-to-build drift analysis.
        </div>
      </div>
    </section>
  );
}