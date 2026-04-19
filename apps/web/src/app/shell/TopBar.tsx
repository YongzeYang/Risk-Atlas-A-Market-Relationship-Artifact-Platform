// apps/web/src/app/shell/TopBar.tsx
import { Link, NavLink, useLocation } from 'react-router-dom';

import { appConfig } from '../../lib/config';

export default function TopBar() {
  const location = useLocation();
  const path = location.pathname;

  const buildsActive = path === '/builds' || /^\/builds\/[^/]+$/.test(path);

  const navClassName = ({ isActive }: { isActive: boolean }) =>
    `topbar__link${isActive ? ' topbar__link--active' : ''}`;

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <Link to="/" className="topbar__brand-link">
          {appConfig.title}
        </Link>
      </div>

      <div className="topbar__nav-group">
        <nav className="topbar__actions" aria-label="Primary">
          <NavLink className={navClassName} to="/" end>
            Home
          </NavLink>

          <NavLink className={`topbar__link${buildsActive ? ' topbar__link--active' : ''}`} to="/builds">
            Snapshots
          </NavLink>

          <NavLink className={navClassName} to="/series">
            Snapshot series
          </NavLink>

          <NavLink className={navClassName} to="/compare">
            What changed
          </NavLink>

          <NavLink className={navClassName} to="/divergence">
            Relationships
          </NavLink>

          <NavLink className={navClassName} to="/exposure">
            Spillover
          </NavLink>

          <NavLink className={navClassName} to="/structure">
            Groups
          </NavLink>
        </nav>

        <div className="topbar__utility">
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

          <Link to="/builds/new" className="button button--primary button--sm topbar__cta">
            Create snapshot
          </Link>
        </div>
      </div>
    </header>
  );
}