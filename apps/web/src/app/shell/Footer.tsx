// apps/web/src/app/shell/Footer.tsx
import { NavLink } from 'react-router-dom';

import { appConfig } from '../../lib/config';
import { primaryNavItems } from './navigation';

export default function Footer() {
  const navClassName = ({ isActive }: { isActive: boolean }) => `footer__link${isActive ? ' footer__link--active' : ''}`;

  return (
    <footer className="footer">
      <div className="footer__content">
        <div className="footer__brand">
          <div className="footer__eyebrow">{appConfig.title}</div>
          <div className="footer__text">Personal research product for Hong Kong market structure.</div>
          <div className="footer__caption">
            This is a personal project for research support. It does not constitute investment advice.
          </div>
        </div>

        <nav className="footer__nav" aria-label="Footer">
          {primaryNavItems.map((item) => (
            <NavLink key={item.to} className={navClassName} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="footer__meta">
          <div className="footer__meta-copy">This website is open source.</div>

          <div className="footer__meta-links">
            <a href={appConfig.websiteSourceUrl} target="_blank" rel="noreferrer">
              Website source
            </a>
            <a href={appConfig.infraRepositoryUrl} target="_blank" rel="noreferrer">
              Infra source
            </a>
          </div>

          <div className="footer__meta-copy">For contact or invite codes:</div>

          <div className="footer__meta-links">
            <a href={`mailto:${appConfig.contactEmail}`}>{appConfig.contactEmail}</a>
            <a href={appConfig.linkedInUrl} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}