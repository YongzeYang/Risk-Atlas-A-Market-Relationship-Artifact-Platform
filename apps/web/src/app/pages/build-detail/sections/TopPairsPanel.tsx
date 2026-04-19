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
        title="2. Which relationships deserve a closer look?"
        subtitle={
          symbolCount
            ? `Top ${topPairs.length} relationships drawn from ${formatInteger(symbolCount)} resolved names.`
            : 'Highest absolute-score relationships in this snapshot.'
        }
      />

      <div className="plain-summary">
        These are the strongest relationships inside this snapshot. Use them as starting points for deeper follow-up, not as a finished thesis.
      </div>

      {topPairs.length === 0 ? (
        <div className="state-note">No relationship summary is available for this snapshot.</div>
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

                <div className="rank-list__meta">
                  {index < 3
                    ? 'One of the strongest pairs — worth comparing across time or lookback'
                    : 'A notable relationship in this snapshot'}
                </div>
              </div>

              <ScorePill score={pair.score} digits={3} />
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}