import { Link } from 'react-router-dom';

import { appConfig } from '../../lib/config';

export default function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <Link to="/" className="topbar__brand-link">
          {appConfig.title}
        </Link>

        <div className="topbar__chips">
          <span className="topbar__chip">MVP</span>
          <span className="topbar__chip topbar__chip--muted">{appConfig.environmentLabel}</span>
        </div>
      </div>

      <div className="topbar__actions">
        <a
          className="topbar__link"
          href={appConfig.apiDocsPath}
          target="_blank"
          rel="noreferrer"
        >
          API Docs
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
      </div>
    </header>
  );
}