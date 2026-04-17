export default function HomeIntroBand() {
  return (
    <section className="intro-band">
      <div className="intro-band__content">
        <div className="intro-band__copy">
          <div className="intro-band__eyebrow">Console Homepage</div>
          <h1 className="intro-band__title">
            Build and inspect Hong Kong market-correlation artifacts.
          </h1>
          <p className="intro-band__description">
            Queue correlation builds from EOD data, track lifecycle status, and inspect the
            resulting artifact bundle through an engineering-focused workbench.
          </p>
        </div>

        <div className="intro-band__actions">
          <div className="intro-band__buttons">
            <a href="#create-build" className="button button--primary">
              Create Build
            </a>
            <a href="/docs" className="button button--secondary" target="_blank" rel="noreferrer">
              Open API Docs
            </a>
          </div>

          <div className="intro-band__chips">
            <span className="intro-band__chip">React / TypeScript</span>
            <span className="intro-band__chip">Fastify API</span>
            <span className="intro-band__chip">C++ .bsm</span>
          </div>
        </div>
      </div>
    </section>
  );
}