// apps/web/src/app/pages/build-detail/sections/TopPairsPanel.tsx
import { formatInteger } from '../../../../lib/format';
import ScorePill from '../../../../components/data-display/ScorePill';
import Panel from '../../../../components/ui/Panel';
import SectionHeader from '../../../../components/ui/SectionHeader';
import type { TopPairItem } from '../../../../types/api';

type TopPairsPanelProps = {
  topPairs: TopPairItem[];
  symbolCount?: number;
};

export default function TopPairsPanel({ topPairs, symbolCount }: TopPairsPanelProps) {
  return (
    <Panel variant="secondary">
      <SectionHeader
        title="Pairs"
        subtitle={
          symbolCount
            ? `Top ${topPairs.length} candidates from ${formatInteger(symbolCount)} resolved symbols.`
            : 'Highest absolute-score relationships in this build.'
        }
      />

      {topPairs.length === 0 ? (
        <div className="state-note">No pair summary is available for this build.</div>
      ) : (
        <ol className="rank-list">
          {topPairs.map((pair, index) => (
            <li
              key={`${pair.left}-${pair.right}`}
              className={`rank-list__item${index < 3 ? ' rank-list__item--top' : ''}`}
            >
              <div className="rank-list__index mono">{index + 1}</div>

              <div className="rank-list__body">
                <div className="rank-list__pair">
                  <span className="mono">{pair.left}</span>
                  <span className="rank-list__pair-sep">↔</span>
                  <span className="mono">{pair.right}</span>
                </div>

                <div className="rank-list__meta">Candidate pair for deeper drift or divergence follow-up</div>
              </div>

              <ScorePill score={pair.score} digits={3} />
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}