import { useState } from 'react';

import BoundaryNote from '../../../components/ui/BoundaryNote';
import Panel from '../../../components/ui/Panel';
import SectionHeader from '../../../components/ui/SectionHeader';
import { useCatalogData } from '../../../features/catalog/hooks';
import BuildFormPanel from '../home/sections/BuildFormPanel';

type LearningGoal = 'diversification' | 'relationships' | 'spillover' | 'groups' | 'comparison';

const GOALS: { id: LearningGoal; label: string; description: string }[] = [
  { id: 'diversification', label: 'See through fake diversification', description: 'Check whether this basket really spreads risk.' },
  { id: 'relationships', label: 'Find relationships worth a closer look', description: 'Spot pairs whose connection looks too strong, too weak, or newly different.' },
  { id: 'spillover', label: "Explore one stock's risk circle", description: 'See who tends to come along when one name moves.' },
  { id: 'groups', label: 'Find hidden groups', description: 'Reveal clusters the basket is forming beneath the surface.' },
  { id: 'comparison', label: 'Prepare snapshots for comparison', description: 'Create a clean point-in-time read you can compare later.' }
];

const GOAL_PREVIEWS: Record<LearningGoal, string[]> = {
  diversification: [
    'A first read on whether the basket really spreads risk',
    'Strong overlaps inside the basket',
    'A group-oriented view of names that already move together'
  ],
  relationships: [
    'The strongest relationships in the snapshot',
    'A starting point for deeper follow-up',
    'A quick handoff into the Relationships screen'
  ],
  spillover: [
    'A snapshot that can be used to inspect related names around one anchor stock'
  ],
  groups: [
    'A basket-level view that can be reordered into hidden groups'
  ],
  comparison: [
    'A clean point-in-time read you can compare later'
  ]
};

export default function NewBuildPage() {
  const {
    datasets,
    universes,
    loading,
    datasetsLoading,
    universesLoading,
    error
  } = useCatalogData();

  const [selectedGoal, setSelectedGoal] = useState<LearningGoal>('diversification');

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

      <section style={{ marginBottom: 'var(--space-5)' }}>
        <SectionHeader
          title="What are you trying to learn?"
          subtitle="Pick a starting question — it shapes the helper copy below."
        />

        <div className="question-selector">
          {GOALS.map((goal) => (
            <button
              key={goal.id}
              type="button"
              className={`question-selector__card${selectedGoal === goal.id ? ' question-selector__card--active' : ''}`}
              onClick={() => setSelectedGoal(goal.id)}
            >
              <div className="question-selector__label">{goal.label}</div>
              <div className="question-selector__description">{goal.description}</div>
            </button>
          ))}
        </div>

        <div className="goal-preview">
          <div className="goal-preview__title">What you'll get</div>
          <ul className="goal-preview__list">
            {GOAL_PREVIEWS[selectedGoal].map((item) => (
              <li key={item} className="goal-preview__item">{item}</li>
            ))}
          </ul>
        </div>
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