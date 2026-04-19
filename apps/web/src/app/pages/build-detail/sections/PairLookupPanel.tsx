// apps/web/src/app/pages/build-detail/sections/PairLookupPanel.tsx
import { useEffect, useState } from 'react';

import ScorePill from '../../../../components/data-display/ScorePill';
import Panel from '../../../../components/ui/Panel';
import SectionHeader from '../../../../components/ui/SectionHeader';
import { getPairScore } from '../../../../features/builds/api';
import type { PairScoreResponse } from '../../../../types/api';

type PairLookupPanelProps = {
  buildRunId: string;
  symbols: string[];
};

export default function PairLookupPanel({
  buildRunId,
  symbols
}: PairLookupPanelProps) {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [result, setResult] = useState<PairScoreResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const symbolsKey = symbols.join('|');

  useEffect(() => {
    if (symbols.length === 0) {
      setLeft('');
      setRight('');
      setResult(null);
      return;
    }

    setLeft(symbols[0] ?? '');
    setRight(symbols[1] ?? symbols[0] ?? '');
    setResult(null);
    setError(null);
  }, [symbolsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setResult(null);
    setError(null);
  }, [left, right]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!left || !right) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const next = await getPairScore(buildRunId, { left, right });
      setResult(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check pair.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel variant="utility">
      <SectionHeader
        title="Check one exact relationship"
        subtitle="Useful when you already know the two names and want to verify how tight the relationship is in this snapshot."
      />

      {symbols.length === 0 ? (
        <div className="state-note">No names are available for this snapshot.</div>
      ) : (
        <>
          <form className="query-form" onSubmit={handleSubmit}>
            <label className="field">
              <span className="field__label">First name</span>
              <select
                className="field__control mono"
                value={left}
                onChange={(event) => setLeft(event.target.value)}
              >
                {symbols.map((symbol) => (
                  <option key={symbol} value={symbol}>
                    {symbol}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__label">Second name</span>
              <select
                className="field__control mono"
                value={right}
                onChange={(event) => setRight(event.target.value)}
              >
                {symbols.map((symbol) => (
                  <option key={symbol} value={symbol}>
                    {symbol}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit" className="button button--secondary">
              {loading ? 'Checking…' : 'Check relationship'}
            </button>
          </form>

          {error ? <div className="state-note state-note--error">{error}</div> : null}

          {result ? (
            <div className="query-result">
              <div className="query-result__title mono">
                {result.left} ↔ {result.right}
              </div>

              <div className="query-result__row">
                <span className="query-result__label">Relationship score</span>
                <ScorePill score={result.score} digits={4} />
              </div>

              <div className="query-result__hint">
                Input order is preserved so the lookup can feed future compare or relationship workflows.
              </div>
            </div>
          ) : !error ? (
            <div className="state-note">Choose two names and check one relationship score.</div>
          ) : null}
        </>
      )}
    </Panel>
  );
}