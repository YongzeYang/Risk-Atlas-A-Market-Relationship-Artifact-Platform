import { useEffect, useState } from 'react';

import ScorePill from '../../../../components/data-display/ScorePill';
import Panel from '../../../../components/ui/Panel';
import SectionHeader from '../../../../components/ui/SectionHeader';
import { getNeighbors } from '../../../../features/builds/api';
import type { NeighborsResponse } from '../../../../types/api';

type NeighborsPanelProps = {
  buildRunId: string;
  symbols: string[];
  disabled: boolean;
};

export default function NeighborsPanel({
  buildRunId,
  symbols,
  disabled
}: NeighborsPanelProps) {
  const [symbol, setSymbol] = useState('');
  const [k, setK] = useState(5);
  const [result, setResult] = useState<NeighborsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (symbols.length === 0) {
      setSymbol('');
      setResult(null);
      return;
    }

    setSymbol(symbols[0]);
  }, [symbols]);

  useEffect(() => {
    if (!symbol || disabled) {
      return;
    }

    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const next = await getNeighbors(buildRunId, { symbol, k });
        if (active) {
          setResult(next);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to query neighbors.');
          setResult(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [buildRunId, symbol, k, disabled]);

  return (
    <Panel>
      <SectionHeader
        title="Neighbors"
        subtitle="Top-k positive correlations for one symbol, excluding self."
      />

      {disabled ? (
        <div className="state-note">Neighbors become available after the build succeeds.</div>
      ) : (
        <>
          <div className="query-form">
            <label className="field">
              <span className="field__label">Symbol</span>
              <select
                className="field__control mono"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
              >
                {symbols.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__label">Top k</span>
              <select
                className="field__control mono"
                value={k}
                onChange={(event) => setK(Number(event.target.value))}
              >
                {[5, 10, 15, 20].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loading ? <div className="state-note">Loading neighbors…</div> : null}
          {error ? <div className="state-note state-note--error">{error}</div> : null}

          {result && result.neighbors.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Symbol</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {result.neighbors.map((entry, index) => (
                    <tr key={entry.symbol} className="data-table__row">
                      <td className="mono">{index + 1}</td>
                      <td className="mono">{entry.symbol}</td>
                      <td>
                        <ScorePill score={entry.score} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {!loading && !error && result && result.neighbors.length === 0 ? (
            <div className="state-note">No neighbors found.</div>
          ) : null}
        </>
      )}
    </Panel>
  );
}