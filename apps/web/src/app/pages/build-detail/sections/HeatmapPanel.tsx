// apps/web/src/app/pages/build-detail/sections/HeatmapPanel.tsx
import { useEffect, useMemo, useState } from 'react';

import HeatmapGrid from '../../../../components/data-display/HeatmapGrid';
import Panel from '../../../../components/ui/Panel';
import SectionHeader from '../../../../components/ui/SectionHeader';
import { getHeatmapSubset } from '../../../../features/builds/api';
import { formatInteger, formatScore } from '../../../../lib/format';
import type { HeatmapSubsetResponse, TopPairItem } from '../../../../types/api';

type HeatmapPanelProps = {
  buildRunId: string;
  symbolOrder: string[];
  topPairs: TopPairItem[];
};

const DESIRED_DEFAULT_SYMBOLS = 8;
const MAX_SELECTABLE_SYMBOLS = 12;

type SubsetStats = {
  pairCount: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  positiveShare: number;
};

function buildDefaultSelection(symbolOrder: string[], topPairs: TopPairItem[]): string[] {
  const ordered: string[] = [];

  for (const pair of topPairs) {
    if (!ordered.includes(pair.left)) {
      ordered.push(pair.left);
    }

    if (!ordered.includes(pair.right)) {
      ordered.push(pair.right);
    }

    if (ordered.length >= DESIRED_DEFAULT_SYMBOLS) {
      break;
    }
  }

  for (const symbol of symbolOrder) {
    if (!ordered.includes(symbol)) {
      ordered.push(symbol);
    }

    if (ordered.length >= DESIRED_DEFAULT_SYMBOLS) {
      break;
    }
  }

  return ordered.slice(0, Math.min(symbolOrder.length, DESIRED_DEFAULT_SYMBOLS));
}

function computeSubsetStats(scores: number[][]): SubsetStats | null {
  const values: number[] = [];

  for (let rowIndex = 0; rowIndex < scores.length; rowIndex += 1) {
    for (let colIndex = rowIndex + 1; colIndex < (scores[rowIndex]?.length ?? 0); colIndex += 1) {
      const value = scores[rowIndex]?.[colIndex];
      if (typeof value === 'number' && Number.isFinite(value)) {
        values.push(value);
      }
    }
  }

  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const sum = values.reduce((total, value) => total + value, 0);
  const mean = sum / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  const midpoint = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[midpoint - 1]! + sorted[midpoint]!) / 2
      : sorted[midpoint]!;

  return {
    pairCount: values.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean,
    median,
    stdDev: Math.sqrt(variance),
    positiveShare: values.filter((value) => value > 0).length / values.length
  };
}

export default function HeatmapPanel({
  buildRunId,
  symbolOrder,
  topPairs
}: HeatmapPanelProps) {
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [subset, setSubset] = useState<HeatmapSubsetResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultSelection = useMemo(
    () => buildDefaultSelection(symbolOrder, topPairs),
    [symbolOrder, topPairs]
  );

  const selectedSet = useMemo(() => new Set(selectedSymbols), [selectedSymbols]);

  const availableSymbols = useMemo(
    () => symbolOrder.filter((symbol) => !selectedSet.has(symbol)),
    [selectedSet, symbolOrder]
  );

  const subsetStats = useMemo(
    () => (subset ? computeSubsetStats(subset.scores) : null),
    [subset]
  );

  useEffect(() => {
    if (symbolOrder.length < 2 || defaultSelection.length < 2) {
      setSelectedSymbols([]);
      setSubset(null);
      setInitialized(false);
      setError(null);
      setLoading(false);
      return;
    }

    setSelectedSymbols(defaultSelection);
    setSubset(null);
    setInitialized(false);
    setError(null);
    setLoading(false);
  }, [buildRunId, defaultSelection, symbolOrder.length]);

  useEffect(() => {
    if (initialized) {
      return;
    }

    if (defaultSelection.length < 2) {
      return;
    }

    let active = true;

    async function loadDefault() {
      setLoading(true);
      setError(null);

      try {
        const next = await getHeatmapSubset(buildRunId, defaultSelection);

        if (!active) {
          return;
        }

        setSubset(next);
        setInitialized(true);
      } catch (err) {
        if (!active) {
          return;
        }

        setError(err instanceof Error ? err.message : 'Failed to load matrix.');
        setSubset(null);
        setInitialized(true);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDefault();

    return () => {
      active = false;
    };
  }, [buildRunId, defaultSelection, initialized]);

  function toggleSymbol(symbol: string) {
    setSelectedSymbols((current) => {
      if (current.includes(symbol)) {
        return current.filter((item) => item !== symbol);
      }

      if (current.length >= MAX_SELECTABLE_SYMBOLS) {
        return current;
      }

      return [...current, symbol];
    });
  }

  async function applySubset() {
    if (selectedSymbols.length < 2) {
      setError('Select at least two symbols.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const next = await getHeatmapSubset(buildRunId, selectedSymbols);
      setSubset(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matrix.');
      setSubset(null);
    } finally {
      setLoading(false);
    }
  }

  function resetPreset() {
    setError(null);
    setSelectedSymbols(defaultSelection);
  }

  if (symbolOrder.length < 2) {
    return (
      <Panel variant="primary">
        <SectionHeader title="1. Is this basket really diversified?" subtitle="Inspect a tight slice before trusting the basket label." />
        <div className="state-note">Not enough names are available for a useful subset view.</div>
      </Panel>
    );
  }

  return (
    <Panel variant="primary">
      <SectionHeader
        title="1. Is this basket really diversified?"
        subtitle="Pick a small slice and read whether it behaves like a mix, a bloc, or a fault line."
        action={
          <div className="toolbar-inline">
            <button type="button" className="button button--ghost button--sm" onClick={resetPreset}>
              Default slice
            </button>

            <button
              type="button"
              className="button button--secondary button--sm"
              onClick={() => {
                void applySubset();
              }}
              disabled={selectedSymbols.length < 2 || loading}
            >
              {loading ? 'Refreshing…' : 'Refresh slice'}
            </button>
          </div>
        }
      />

      <div className="selection-summary">
        <div>
          <div className="selection-summary__count">
            Visible slice · {selectedSymbols.length} of {MAX_SELECTABLE_SYMBOLS} names
          </div>

          <div className="selection-summary__hint">
            The default slice starts from the tightest relationships, then lets you swap names
            without flattening the visible contrast.
          </div>
        </div>

        <div className="selection-summary__meta">Order stays fixed for repeatable reads.</div>
      </div>

      <div className="selection-groups">
        <section className="selection-group">
          <div className="selection-group__header">
            <h3 className="selection-group__title">Selected symbols</h3>
            <span className="selection-group__count">{selectedSymbols.length}</span>
          </div>

          <div className="selection-group__body">
            {selectedSymbols.length > 0 ? (
              <div className="chip-list">
                {selectedSymbols.map((symbol) => (
                  <button
                    key={symbol}
                    type="button"
                    className="symbol-chip symbol-chip--active"
                    onClick={() => toggleSymbol(symbol)}
                    title="Remove symbol"
                  >
                    <span className="mono">{symbol}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="state-note">Select at least two symbols.</div>
            )}
          </div>
        </section>

        <section className="selection-group selection-group--available">
          <div className="selection-group__header">
            <h3 className="selection-group__title">Available symbols</h3>
            <span className="selection-group__count">{availableSymbols.length}</span>
          </div>

          <div className="selection-group__body">
            <div className="chip-list">
              {availableSymbols.map((symbol) => {
                const disabled = selectedSymbols.length >= MAX_SELECTABLE_SYMBOLS;

                return (
                  <button
                    key={symbol}
                    type="button"
                    className={`symbol-chip${disabled ? ' symbol-chip--disabled' : ''}`}
                    onClick={() => toggleSymbol(symbol)}
                    disabled={disabled}
                    title={disabled ? 'Selection limit reached' : 'Add symbol'}
                  >
                    <span className="mono">{symbol}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {error ? <div className="state-note state-note--error">{error}</div> : null}
      {loading && !subset ? <div className="state-note">Loading heatmap…</div> : null}

      {subset ? (
        <>
          {subsetStats ? (
            <div className="plain-summary">
              {subsetStats.positiveShare > 0.75
                ? 'This slice behaves more like one bloc than a real mix.'
                : subsetStats.positiveShare > 0.5
                  ? 'Most of these names still lean the same way, but the structure is no longer one note.'
                  : 'This slice carries real cross-currents instead of one dominant bloc.'}
            </div>
          ) : null}

          {subsetStats ? (
            <div className="matrix-stats-grid">
              <article className="matrix-stat-card">
                <div className="matrix-stat-card__label">Visible pairs</div>
                <div className="matrix-stat-card__value mono">{formatInteger(subsetStats.pairCount)}</div>
              </article>

              <article className="matrix-stat-card">
                <div className="matrix-stat-card__label">Midpoint</div>
                <div className="matrix-stat-card__value mono">{formatScore(subsetStats.median, 3)}</div>
              </article>

              <article className="matrix-stat-card">
                <div className="matrix-stat-card__label">Spread</div>
                <div className="matrix-stat-card__value mono">{formatScore(subsetStats.stdDev, 3)}</div>
              </article>

              <article className="matrix-stat-card">
                <div className="matrix-stat-card__label">Moving together</div>
                <div className="matrix-stat-card__value mono">{formatScore(subsetStats.positiveShare * 100, 1)}%</div>
              </article>
            </div>
          ) : null}

          <div className="matrix-context-note">
            Range {subsetStats ? `${formatScore(subsetStats.min, 3)} → ${formatScore(subsetStats.max, 3)}` : '—'} · mean {subsetStats ? formatScore(subsetStats.mean, 3) : '—'} · median {subsetStats ? formatScore(subsetStats.median, 3) : '—'}.
            Use the midpoint and spread to judge whether this slice is cohesive, mixed, or pulling apart.
          </div>

          <HeatmapGrid symbols={subset.symbolOrder} scores={subset.scores} />
        </>
      ) : !loading ? (
        <div className="state-note">Pick at least two names.</div>
      ) : null}
    </Panel>
  );
}