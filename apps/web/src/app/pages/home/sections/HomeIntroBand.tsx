// apps/web/src/app/pages/home/sections/HomeIntroBand.tsx
export default function HomeIntroBand() {
  return (
    <section className="intro-band">
      <div className="intro-band__eyebrow">Risk Atlas HK</div>

      <h1 className="intro-band__title">
        Build and inspect Hong Kong correlation results.
      </h1>

      <p className="intro-band__description">
        Start a build from a saved dataset and review recent results in one place.
      </p>

      <div className="intro-band__actions">
        <a href="#create-build" className="button button--primary">
          Start a build
        </a>
      </div>
    </section>
  );
}