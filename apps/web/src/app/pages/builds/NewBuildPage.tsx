import Panel from '../../../components/ui/Panel';
import SectionHeader from '../../../components/ui/SectionHeader';
import { useCatalogData } from '../../../features/catalog/hooks';
import BuildFormPanel from '../home/sections/BuildFormPanel';

export default function NewBuildPage() {
  const { datasets, universes, loading, error } = useCatalogData();

  return (
    <div className="page page--new-build">
      <section className="workspace-hero workspace-hero--narrow">
        <div className="workspace-hero__copy">
          <div className="workspace-hero__eyebrow">New build</div>
          <h1 className="workspace-hero__title">Create a build in its own workspace, not inside the homepage.</h1>
          <p className="workspace-hero__description">
            This page isolates the research setup flow so users can focus on dataset, universe,
            as-of date, and window choices without also parsing catalogs, activity streams, and
            unrelated entry points.
          </p>
        </div>
      </section>

      <div className="workspace-layout">
        <div className="workspace-layout__main">
          <BuildFormPanel
            datasets={datasets}
            universes={universes}
            loading={loading}
            error={error}
            onBuildCreated={() => {}}
          />
        </div>

        <div className="workspace-layout__side">
          <Panel variant="utility">
            <SectionHeader
              title="Current universe model"
              subtitle="Research scope is now explicit before you launch a run."
            />

            <div className="workspace-note-list">
              <div className="workspace-note-list__item">Static universes remain useful for curated demonstrations and reproducible case studies.</div>
              <div className="workspace-note-list__item">Dynamic universes expose liquidity, sector, and common-equity scope as research choices rather than hidden implementation details.</div>
              <div className="workspace-note-list__item">Invite code is remembered locally so frequent iteration does not force repetitive input.</div>
            </div>
          </Panel>

          <Panel variant="utility">
            <SectionHeader
              title="Available now"
              subtitle="A concise summary instead of a full catalog sidebar."
            />

            <div className="coverage-token-list">
              {universes.slice(0, 8).map((universe) => (
                <span key={universe.id} className="coverage-token">
                  {universe.name}
                </span>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}