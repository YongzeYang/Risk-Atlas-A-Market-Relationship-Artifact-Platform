import { appConfig } from '../../lib/config';

export default function BannerStrip() {
  return (
    <div className="banner-strip">
      <div className="banner-strip__items">
        <span className="banner-strip__item">Hong Kong EOD</span>
        <span className="banner-strip__item">Artifact-driven</span>
        <span className="banner-strip__item">{appConfig.environmentLabel}</span>
        <span className="banner-strip__item">React + Fastify + PostgreSQL + C++ BSM</span>
      </div>
    </div>
  );
}