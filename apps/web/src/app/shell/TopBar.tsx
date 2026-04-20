// apps/web/src/app/shell/TopBar.tsx
import { Link, NavLink } from 'react-router-dom';

import { appConfig } from '../../lib/config';
import { primaryNavItems } from './navigation';

export default function TopBar() {
  const appIconUrl = new URL('../../static/icon.svg', import.meta.url).href;
  const navClassName = ({ isActive }: { isActive: boolean }) => `topbar__link${isActive ? ' topbar__link--active' : ''}`;

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <Link to="/" className="topbar__brand-link">
          <span className="topbar__brand-text">{appConfig.title}</span>
          <img className="topbar__brand-mark" src={appIconUrl} alt="" aria-hidden="true" />
        </Link>
      </div>

      <div className="topbar__nav-group">
        <nav className="topbar__actions" aria-label="Primary">
          {primaryNavItems.map((item) => (
            <NavLink key={item.to} className={navClassName} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="topbar__utility">
          <a
            className="topbar__utility-link"
            href={appConfig.apiDocsPath}
            target="_blank"
            rel="noreferrer"
          >
            API docs
          </a>

          {appConfig.repositoryUrl ? (
            <a
              className="topbar__utility-link"
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