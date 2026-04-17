import { useEffect, useMemo, useState } from 'react';

import HeatmapGrid from '../../../../components/data-display/HeatmapGrid';
import Panel from '../../../../components/ui/Panel';
import SectionHeader from '../../../../components/ui/SectionHeader';
import { getHeatmapSubset } from '../../../../features/builds/api';
import type { HeatmapSubsetResponse, TopPairItem } from '../../../../types/api';

type HeatmapPanelProps = {
  buildRunId: string;
  symbolOrder: string[];
  topPairs: TopPairItem[];
  disabled: boolean;
};

const DESIRED_DEFAULT_SYMBOLS = 8;
const MAX_SELECTABLE_SYMBOLS = 12;

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

export default function HeatmapPanel({
  buildRunId,
  symbolOrder,
  topPairs,
  disabled
}: HeatmapPanelProps) {
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [subset, setSubset] = useState<HeatmapSubsetResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultSelection = useMemo(
    () => buildDefaultSelection(symbolOrder, topPairs),
    [symbolOrder, topPairs]
  );

  useEffect(() => {
    if (disabled || defaultSelection.length < 2) {
      setSelectedSymbols([]);
      setSubset(null);
      return;
    }

    setSelectedSymbols(defaultSelection);

    let active = true;

    async function loadDefault() {
      setLoading(true);
      setError(null);

      try {
        const next = await getHeatmapSubset(buildRunId, defaultSelection);
        if (active) {
          setSubset(next);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load default heatmap subset.');
          setSubset(null);
        }
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
  }, [buildRunId, defaultSelection, disabled]);

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
      setError('Select at least two symbols to render a heatmap subset.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const next = await getHeatmapSubset(buildRunId, selectedSymbols);
      setSubset(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load heatmap subset.');
      setSubset(null);
    } finally {
      setLoading(false);
    }
  }

  function resetPreset() {
    setSelectedSymbols(defaultSelection);
  }

  return (
    <Panel>
      <SectionHeader
        title="Heatmap Subset"
        subtitle="Select a small symbol subset and render a preview-backed correlation matrix."
        action={
          <div className="toolbar-inline">
            <button type="button" className="button button--ghost button--sm" onClick={resetPreset}>
              Reset Preset
            </button>
            <button
              type="button"
              className="button button--secondary button--sm"
              onClick={() => {
                void applySubset();
              }}
              disabled={disabled || selectedSymbols.length < 2 || loading}
            >
              {loading ? 'Applying…' : 'Apply Subset'}
            </button>
          </div>
        }
      />

      {disabled ? (
        <div className="state-note">Heatmap subset becomes available after build success.</div>
      ) : (
        <>
          <div className="heatmap-toolbar">
            <div className="heatmap-toolbar__meta">
              <span className="heatmap-toolbar__count">
                Selected {selectedSymbols.length} / {MAX_SELECTABLE_SYMBOLS}
              </span>
              <span className="heatmap-toolbar__hint">
                Request order is preserved in the rendered matrix.
              </span>
            </div>

            <div className="chip-list">
              {symbolOrder.map((symbol) => {
                const active = selectedSymbols.includes(symbol);

                return (
                  <button
                    key={symbol}
                    type="button"
                    className={`symbol-chip${active ? ' symbol-chip--active' : ''}`}
                    onClick={() => toggleSymbol(symbol)}
                  >
                    <span className="mono">{symbol}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {error ? <div className="state-note state-note--error">{error}</div> : null}

          {subset ? (
            <HeatmapGrid symbols={subset.symbolOrder} scores={subset.scores} />
          ) : !loading ? (
            <div className="state-note">No heatmap subset loaded yet.</div>
          ) : null}
        </>
      )}
    </Panel>
  );
}