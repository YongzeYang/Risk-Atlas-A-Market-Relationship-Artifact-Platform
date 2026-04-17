import ScorePill from '../../../../components/data-display/ScorePill';
import Panel from '../../../../components/ui/Panel';
import SectionHeader from '../../../../components/ui/SectionHeader';
import type { TopPairItem } from '../../../../types/api';

type TopPairsPanelProps = {
  topPairs: TopPairItem[];
  loading: boolean;
  disabled: boolean;
};

export default function TopPairsPanel({ topPairs, loading, disabled }: TopPairsPanelProps) {
  return (
    <Panel>
      <SectionHeader
        title="Top Pairs"
        subtitle="Strongest off-diagonal relationships from the built correlation matrix."
      />

      {loading ? <div className="state-note">Loading pair summaries…</div> : null}

      {!loading && disabled ? (
        <div className="state-note">
          Pair summaries become available when the build reaches succeeded status.
        </div>
      ) : null}

      {!loading && !disabled && topPairs.length === 0 ? (
        <div className="state-note">No top pairs available for this build.</div>
      ) : null}

      {!loading && !disabled && topPairs.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Left</th>
                <th>Right</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {topPairs.map((pair, index) => (
                <tr key={`${pair.left}-${pair.right}`} className="data-table__row">
                  <td className="mono">{index + 1}</td>
                  <td className="mono">{pair.left}</td>
                  <td className="mono">{pair.right}</td>
                  <td>
                    <ScorePill score={pair.score} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}