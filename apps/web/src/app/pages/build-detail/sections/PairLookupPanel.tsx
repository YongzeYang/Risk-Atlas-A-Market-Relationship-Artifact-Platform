import { useEffect, useState } from 'react';

import ScorePill from '../../../../components/data-display/ScorePill';
import Panel from '../../../../components/ui/Panel';
import SectionHeader from '../../../../components/ui/SectionHeader';
import { getPairScore } from '../../../../features/builds/api';
import type { PairScoreResponse } from '../../../../types/api';

type PairLookupPanelProps = {
  buildRunId: string;
  symbols: string[];
  disabled: boolean;
};

export default function PairLookupPanel({
  buildRunId,
  symbols,
  disabled
}: PairLookupPanelProps) {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [result, setResult] = useState<PairScoreResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, [symbols]);

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
      setError(err instanceof Error ? err.message : 'Failed to query pair score.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel>
      <SectionHeader
        title="Pair Lookup"
        subtitle="Query one ordered symbol pair through the preview-backed API."
      />

      {disabled ? (
        <div className="state-note">Build queries become available after success.</div>
      ) : (
        <>
          <form className="query-form" onSubmit={handleSubmit}>
            <label className="field">
              <span className="field__label">Left symbol</span>
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
              <span className="field__label">Right symbol</span>
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
              {loading ? 'Querying…' : 'Query Pair'}
            </button>
          </form>

          {error ? <div className="state-note state-note--error">{error}</div> : null}

          {result ? (
            <div className="query-result">
              <div className="query-result__title mono">
                {result.left} ↔ {result.right}
              </div>
              <div className="query-result__row">
                <span className="query-result__label">Correlation score</span>
                <ScorePill score={result.score} />
              </div>
              <div className="query-result__hint">
                Pearson correlation over the selected build window.
              </div>
            </div>
          ) : (
            <div className="state-note">Choose a pair and query the built artifact preview.</div>
          )}
        </>
      )}
    </Panel>
  );
}