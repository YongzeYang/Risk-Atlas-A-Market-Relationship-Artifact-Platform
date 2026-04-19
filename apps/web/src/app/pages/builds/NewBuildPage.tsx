import { Link } from 'react-router-dom';

import BoundaryNote from '../../../components/ui/BoundaryNote';
import Panel from '../../../components/ui/Panel';
import SectionHeader from '../../../components/ui/SectionHeader';
import { useCatalogData } from '../../../features/catalog/hooks';
import BuildFormPanel from '../home/sections/BuildFormPanel';

type WorkflowId = 'snapshots' | 'series' | 'compare' | 'relationships' | 'spillover';

const WORKFLOWS: {
  id: WorkflowId;
  label: string;
  title: string;
  description: string;
  to: string;
  actionLabel: string;
  current?: boolean;
}[] = [
  {
    id: 'snapshots',
    label: 'Snapshots',
    title: 'Start with one clean snapshot',
    description: 'Use this page when you want one basket at one date before any follow-up screen.',
    to: '/builds/new',
    actionLabel: 'You are here',
    current: true
  },
  {
    id: 'series',
    label: 'Snapshot series',
    title: 'Track one basket through time',
    description: 'Use repeated snapshots when the real question is drift across many dates.',
    to: '/series',
    actionLabel: 'Open Snapshot series'
  },
  {
    id: 'compare',
    label: 'What changed',
    title: 'Compare two finished snapshots',
    description: 'Use this only after you already have two ready snapshots worth reopening.',
    to: '/compare',
    actionLabel: 'Open What changed'
  },
  {
    id: 'relationships',
    label: 'Relationships',
    title: 'Follow unusual pair moves',
    description: 'Use one ready snapshot to find relationships worth a closer look.',
    to: '/divergence',
    actionLabel: 'Open Relationships'
  },
  {
    id: 'spillover',
    label: 'Spillover',
    title: 'Start from one stock inside a snapshot',
    description: 'Use one ready snapshot when your question is who tends to move with an anchor name.',
    to: '/exposure',
    actionLabel: 'Open Spillover'
  }
];

export default function NewBuildPage() {
  const {
    datasets,
    universes,
    loading,
    datasetsLoading,
    universesLoading,
    error
  } = useCatalogData();

  const staticUniverses = universes.filter((u) => u.definitionKind === 'static');
  const dynamicUniverses = universes.filter((u) => u.definitionKind !== 'static');
  const sectorBaskets = universes.filter((u) => u.id.includes('financials') || u.id.includes('tech') || u.id.includes('property') || u.id.includes('energy'));

  return (
    <div className="page page--new-build">
      <section className="workspace-hero workspace-hero--narrow">
        <div className="workspace-hero__copy">
          <h1 className="workspace-hero__title">Create a snapshot</h1>
          <p className="workspace-hero__description">
            Take one market read with a clear basket, date, and lookback.
            Start with one concrete question. Everything else comes after the snapshot is ready.
          </p>
        </div>
      </section>

      <section className="workflow-picker">
        <SectionHeader
          title="Choose the right starting point"
          subtitle="These are different workflows. This page creates one snapshot; the other paths open their own screens."
        />

        <div className="workflow-picker__grid">
          {WORKFLOWS.map((workflow) => (
            <article
              key={workflow.id}
              className={`workflow-card${workflow.current ? ' workflow-card--current' : ''}`}
            >
              <div className="workflow-card__label">{workflow.label}</div>
              <div className="workflow-card__title">{workflow.title}</div>
              <div className="workflow-card__description">{workflow.description}</div>
              {workflow.current ? (
                <div className="workflow-card__action workflow-card__action--current">
                  {workflow.actionLabel}
                </div>
              ) : (
                <Link to={workflow.to} className="workflow-card__action">
                  {workflow.actionLabel}
                </Link>
              )}
            </article>
          ))}
        </div>

        <div className="goal-preview">
          <div className="goal-preview__title">What one snapshot gives you</div>
          <ul className="goal-preview__list">
            <li className="goal-preview__item">A first basket-level read of overlap, concentration, and hidden structure.</li>
            <li className="goal-preview__item">The base read you can later reopen in Relationships, Spillover, or What changed.</li>
            <li className="goal-preview__item">The starting point for hidden-group inspection, even if that is your final question.</li>
          </ul>
        </div>

        <BoundaryNote variant="accent">
          Hidden groups still begin with a ready snapshot. This page creates that base read; the follow-up screens come after.
        </BoundaryNote>
      </section>

      <div className="workspace-layout">
        <div className="workspace-layout__main">
          <BuildFormPanel
            datasets={datasets}
            universes={universes}
            loading={loading}
            datasetsLoading={datasetsLoading}
            universesLoading={universesLoading}
            error={error}
            onBuildCreated={() => {}}
          />
        </div>

        <div className="workspace-layout__side">
          <Panel variant="utility">
            <SectionHeader
              title="How to choose the setup"
              subtitle="Keep the question simple first. You can always compare or drill deeper later."
            />

            <div className="workspace-note-list">
              <div className="workspace-note-list__item">Use a fixed basket when you want a stable case study or a repeatable watchlist.</div>
              <div className="workspace-note-list__item">Use a rule-based basket when you want the basket to reflect current market scope at the chosen date.</div>
              <div className="workspace-note-list__item">Use a shorter lookback for fresher behavior and a longer lookback for steadier structure.</div>
            </div>
          </Panel>

          <BoundaryNote variant="accent">
            Invite code is needed only when you create a new snapshot. Browsing and comparison stay open.
          </BoundaryNote>

          <Panel variant="utility">
            <SectionHeader
              title="Suggested market baskets"
              subtitle="Start with one of these if you want a clean first read."
            />

            {universesLoading && universes.length === 0 ? <div className="state-note">Loading baskets…</div> : null}

            {!universesLoading || universes.length > 0 ? (
              <div className="basket-groups">
                {staticUniverses.length > 0 ? (
                  <div>
                    <div className="basket-group__title">Quick starts</div>
                    <div className="coverage-token-list">
                      {staticUniverses.slice(0, 4).map((universe) => (
                        <span key={universe.id} className="coverage-token">{universe.name}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {dynamicUniverses.length > 0 ? (
                  <div>
                    <div className="basket-group__title">Broader market reads</div>
                    <div className="coverage-token-list">
                      {dynamicUniverses.slice(0, 4).map((universe) => (
                        <span key={universe.id} className="coverage-token">{universe.name}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {sectorBaskets.length > 0 ? (
                  <div>
                    <div className="basket-group__title">Sector baskets</div>
                    <div className="coverage-token-list">
                      {sectorBaskets.slice(0, 4).map((universe) => (
                        <span key={universe.id} className="coverage-token">{universe.name}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
    </div>
  );
}