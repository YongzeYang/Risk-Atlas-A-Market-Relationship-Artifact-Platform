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

  if (Math.abs(value) < 0.0001) {
    return 'hsl(221 27% 18%)';
  }

  if (value > 0) {
    const lightness = 22 + value * 26;
    return `hsl(198 88% ${lightness}%)`;
  }

  const lightness = 20 + Math.abs(value) * 22;
  return `hsl(22 88% ${lightness}%)`;
}

function scoreClass(score: number): string {
  return Math.abs(score) > 0.45 ? 'heatmap-grid__cell--strong' : 'heatmap-grid__cell--soft';
}

export default function HeatmapGrid({ symbols, scores }: HeatmapGridProps) {
  return (
    <div className="heatmap">
      <div className="heatmap__legend">
        <span className="heatmap__legend-label">Correlation</span>
        <div className="heatmap__legend-scale">
          <span className="heatmap__legend-stop heatmap__legend-stop--negative">-1.0</span>
          <span className="heatmap__legend-stop heatmap__legend-stop--neutral">0.0</span>
          <span className="heatmap__legend-stop heatmap__legend-stop--positive">+1.0</span>
        </div>
      </div>

      <div className="heatmap__scroll">
        <div
          className="heatmap-grid"
          style={{
            gridTemplateColumns: `148px repeat(${symbols.length}, minmax(72px, 1fr))`
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

              {scores[rowIndex]?.map((score, colIndex) => (
                <div
                  key={`${rowSymbol}-${symbols[colIndex]}`}
                  className={`heatmap-grid__cell ${scoreClass(score)}`}
                  style={{ backgroundColor: scoreToColor(score) }}
                  title={`${rowSymbol} ↔ ${symbols[colIndex]} = ${formatScore(score)}`}
                >
                  {formatScore(score, 2)}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}