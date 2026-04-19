// apps/web/src/app/shell/Footer.tsx
import { appConfig } from '../../lib/config';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__content">
        <span className="footer__text">Hong Kong market relationship research.</span>

        <div className="footer__links">
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