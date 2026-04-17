// apps/web/src/components/data-display/HeatmapGrid.tsx
import { Fragment } from 'react';

import { formatScore } from '../../lib/format';

type HeatmapGridProps = {
  symbols: string[];
  scores: number[][];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreToColor(score: number): string {
  const value = clamp(score, -1, 1);

  if (Math.abs(value) < 0.02) {
    return 'hsl(220 14% 24%)';
  }

  if (value > 0) {
    const lightness = 22 + value * 18;
    return `hsl(208 28% ${lightness}%)`;
  }

  const lightness = 20 + Math.abs(value) * 17;
  return `hsl(18 22% ${lightness}%)`;
}

function scoreClass(score: number): string {
  return Math.abs(score) >= 0.55 ? 'heatmap-grid__cell--strong' : 'heatmap-grid__cell--soft';
}

export default function HeatmapGrid({ symbols, scores }: HeatmapGridProps) {
  return (
    <div className="heatmap">
      <div className="heatmap__legend">
        <span className="heatmap__legend-label">Correlation</span>

        <div className="heatmap__legend-scale">
          <span className="heatmap__legend-value mono">-1.0</span>
          <div className="heatmap__legend-bar" />
          <span className="heatmap__legend-value mono">+1.0</span>
        </div>

        <span className="heatmap__legend-note mono">0.0 midpoint</span>
      </div>

      <div className="heatmap__scroll">
        <div
          className="heatmap-grid"
          style={{
            gridTemplateColumns: `132px repeat(${symbols.length}, minmax(84px, 1fr))`
          }}
        >
          <div className="heatmap-grid__corner" />

          {symbols.map((symbol) => (
            <div key={`col-${symbol}`} className="heatmap-grid__col-header mono">
              {symbol}
            </div>
          ))}

          {symbols.map((rowSymbol, rowIndex) => (
            <Fragment key={`row-${rowSymbol}`}>
              <div className="heatmap-grid__row-header mono">{rowSymbol}</div>

              {scores[rowIndex]?.map((score, colIndex) => {
                const diagonal = rowIndex === colIndex;

                return (
                  <div
                    key={`${rowSymbol}-${symbols[colIndex]}`}
                    className={`heatmap-grid__cell ${scoreClass(score)}${
                      diagonal ? ' heatmap-grid__cell--diagonal' : ''
                    }`}
                    style={{ backgroundColor: scoreToColor(score) }}
                    title={`${rowSymbol} ↔ ${symbols[colIndex]} = ${formatScore(score, 3)}`}
                  >
                    {formatScore(score, 2)}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}