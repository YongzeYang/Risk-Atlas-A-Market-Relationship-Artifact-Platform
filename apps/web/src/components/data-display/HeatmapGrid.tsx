// apps/web/src/components/data-display/HeatmapGrid.tsx
import { Fragment } from 'react';

import { formatScore } from '../../lib/format';

type HeatmapGridProps = {
  symbols: string[];
  scores: number[][];
};

type ScoreScale = {
  min: number;
  max: number;
  positiveMin: number;
  positiveMax: number;
  negativeMinAbs: number;
  negativeMaxAbs: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return 0.5;
  }

  if (Math.abs(max - min) < 1e-9) {
    return 0.65;
  }

  return clamp((value - min) / (max - min), 0, 1);
}

function computeScoreScale(scores: number[][]): ScoreScale {
  const values: number[] = [];

  for (let rowIndex = 0; rowIndex < scores.length; rowIndex += 1) {
    for (let colIndex = rowIndex + 1; colIndex < (scores[rowIndex]?.length ?? 0); colIndex += 1) {
      const value = scores[rowIndex]?.[colIndex];
      if (typeof value === 'number' && Number.isFinite(value)) {
        values.push(value);
      }
    }
  }

  const positives = values.filter((value) => value > 0);
  const negativesAbs = values.filter((value) => value < 0).map((value) => Math.abs(value));

  return {
    min: values.length > 0 ? Math.min(...values) : -1,
    max: values.length > 0 ? Math.max(...values) : 1,
    positiveMin: positives.length > 0 ? Math.min(...positives) : 0,
    positiveMax: positives.length > 0 ? Math.max(...positives) : 1,
    negativeMinAbs: negativesAbs.length > 0 ? Math.min(...negativesAbs) : 0,
    negativeMaxAbs: negativesAbs.length > 0 ? Math.max(...negativesAbs) : 1
  };
}

function scoreToColor(score: number, scale: ScoreScale, diagonal: boolean): string {
  const value = clamp(score, -1, 1);

  if (diagonal) {
    return 'hsl(215 24% 34%)';
  }

  if (Math.abs(value) < 0.02) {
    return 'hsl(220 14% 24%)';
  }

  if (value > 0) {
    const emphasis = normalize(value, scale.positiveMin, scale.positiveMax);
    const saturation = 28 + emphasis * 22;
    const lightness = 18 + emphasis * 26;
    return `hsl(208 ${saturation}% ${lightness}%)`;
  }

  const magnitude = Math.abs(value);
  const emphasis = normalize(magnitude, scale.negativeMinAbs, scale.negativeMaxAbs);
  const saturation = 20 + emphasis * 22;
  const lightness = 18 + emphasis * 24;
  return `hsl(18 ${saturation}% ${lightness}%)`;
}

function scoreClass(score: number): string {
  return Math.abs(score) >= 0.55 ? 'heatmap-grid__cell--strong' : 'heatmap-grid__cell--soft';
}

export default function HeatmapGrid({ symbols, scores }: HeatmapGridProps) {
  const scale = computeScoreScale(scores);

  return (
    <div className="heatmap">
      <div className="heatmap__legend">
        <span className="heatmap__legend-label">Subset-scaled correlation contrast</span>

        <div className="heatmap__legend-scale">
          <span className="heatmap__legend-value mono">{formatScore(scale.min, 2)}</span>
          <div className="heatmap__legend-bar" />
          <span className="heatmap__legend-value mono">{formatScore(scale.max, 2)}</span>
        </div>

        <span className="heatmap__legend-note mono">contrast adapts to the visible subset</span>
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
                    style={{ backgroundColor: scoreToColor(score, scale, diagonal) }}
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