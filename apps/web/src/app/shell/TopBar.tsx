// apps/web/src/app/shell/TopBar.tsx
import { Link } from 'react-router-dom';

import { appConfig } from '../../lib/config';

export default function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <Link to="/" className="topbar__brand-link">
          {appConfig.title}
        </Link>
      </div>

      <nav className="topbar__actions" aria-label="Primary">
        <a
          className="topbar__link"
          href={appConfig.apiDocsPath}
          target="_blank"
          rel="noreferrer"
        >
          API docs
        </a>

        {appConfig.repositoryUrl ? (
          <a
            className="topbar__link"
            href={appConfig.repositoryUrl}
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        ) : null}
      </nav>
    </header>
  );
}