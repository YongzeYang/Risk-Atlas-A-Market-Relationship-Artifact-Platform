// apps/web/src/app/shell/Footer.tsx
import { Link, useLocation } from 'react-router-dom';

import { appConfig } from '../../lib/config';

export default function Footer() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <footer className={`footer${isHome ? ' footer--home' : ''}`}>
      <div className="footer__content">
        <div className="footer__summary">
          <span className="footer__text">
            {isHome
              ? 'Market structure research for Hong Kong equities.'
              : 'Hong Kong market relationship research.'}
          </span>

          {isHome ? (
            <span className="footer__caption">
              Start with one snapshot. Compare only when your real question is change.
            </span>
          ) : null}
        </div>

        <div className="footer__links">
          {isHome ? (
            <>
              <Link to="/builds">Snapshots</Link>
              <Link to="/compare">What changed</Link>
              <Link to="/divergence">Relationships</Link>
              <Link to="/exposure">Spillover</Link>
              <Link to="/structure">Groups</Link>
            </>
          ) : null}

          <a href={appConfig.apiDocsPath} target="_blank" rel="noreferrer">
            API docs
          </a>

          {appConfig.repositoryUrl ? (
            <a href={appConfig.repositoryUrl} target="_blank" rel="noreferrer">
              GitHub
            </a>
          ) : null}
        </div>
      </div>
    </footer>
  );
}