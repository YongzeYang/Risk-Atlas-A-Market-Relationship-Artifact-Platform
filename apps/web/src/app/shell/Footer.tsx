import { appConfig } from '../../lib/config';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__content">
        <span className="footer__text">
          Risk Atlas HK · Hong Kong EOD correlation artifact explorer
        </span>

        <div className="footer__links">
          <a href={appConfig.apiDocsPath} target="_blank" rel="noreferrer">
            API Docs
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