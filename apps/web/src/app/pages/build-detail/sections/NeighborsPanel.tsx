// apps/web/src/app/pages/build-detail/sections/NeighborsPanel.tsx
import { useEffect, useState } from 'react';

import ScorePill from '../../../../components/data-display/ScorePill';
import Panel from '../../../../components/ui/Panel';
import SectionHeader from '../../../../components/ui/SectionHeader';
import { getNeighbors } from '../../../../features/builds/api';
import type { NeighborsResponse } from '../../../../types/api';

type NeighborsPanelProps = {
  buildRunId: string;
  symbols: string[];
};

export default function NeighborsPanel({
  buildRunId,
  symbols
}: NeighborsPanelProps) {
  const [symbol, setSymbol] = useState('');
  const [k, setK] = useState(5);
  const [result, setResult] = useState<NeighborsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const symbolsKey = symbols.join('|');

  useEffect(() => {
    if (symbols.length === 0) {
      setSymbol('');
      setResult(null);
      return;
    }

    setSymbol(symbols[0]);
  }, [symbolsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!symbol) {
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
          setError(err instanceof Error ? err.message : 'Failed to load related symbols.');
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
  }, [buildRunId, symbol, k]);

  return (
    <Panel variant="utility">
      <SectionHeader
        title="Co-movement exposure"
        subtitle="Inspect the strongest neighbors for one symbol inside this build."
      />

      {symbols.length === 0 ? (
        <div className="state-note">No symbols are available for this build.</div>
      ) : (
        <>
          <div className="query-form query-form--inline">
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

          {loading ? <div className="state-note">Loading related symbols…</div> : null}
          {error ? <div className="state-note state-note--error">{error}</div> : null}

          {result && result.neighbors.length > 0 ? (
            <ol className="neighbor-list">
              {result.neighbors.map((entry, index) => (
                <li key={entry.symbol} className="neighbor-list__item">
                  <div className="neighbor-list__index mono">{index + 1}</div>

                  <div className="neighbor-list__body">
                    <div className="neighbor-list__symbol mono">{entry.symbol}</div>
                    <div className="neighbor-list__meta">Nearest co-movement candidate for {result.symbol}</div>
                  </div>

                  <ScorePill score={entry.score} digits={3} />
                </li>
              ))}
            </ol>
          ) : null}

          {!loading && !error && result && result.neighbors.length === 0 ? (
            <div className="state-note">No related symbols found.</div>
          ) : null}
        </>
      )}
    </Panel>
  );
}