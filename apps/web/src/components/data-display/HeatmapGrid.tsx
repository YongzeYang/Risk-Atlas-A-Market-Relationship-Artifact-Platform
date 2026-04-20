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

const HEATMAP_BASE = '#0b1017';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mixColor(variableName: string, percentage: number): string {
  return `color-mix(in srgb, var(${variableName}) ${Math.round(percentage)}%, ${HEATMAP_BASE})`;
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
    return mixColor('--data-diagonal', 86);
  }

  if (Math.abs(value) < 0.02) {
    return mixColor('--data-neutral', 74);
  }

  if (value > 0) {
    const emphasis = normalize(value, scale.positiveMin, scale.positiveMax);
    return mixColor('--data-positive', 44 + emphasis * 44);
  }

  const magnitude = Math.abs(value);
  const emphasis = normalize(magnitude, scale.negativeMinAbs, scale.negativeMaxAbs);
  return mixColor('--data-negative', 42 + emphasis * 44);
}

function describeScore(score: number, diagonal: boolean): string {
  if (diagonal) {
    return 'self relationship';
  }

  if (score > 0.12) {
    return 'moving together';
  }

  if (score < -0.12) {
    return 'pulling apart';
  }

  return 'roughly mixed';
}

function scoreClass(score: number): string {
  return Math.abs(score) >= 0.55 ? 'heatmap-grid__cell--strong' : 'heatmap-grid__cell--soft';
}

export default function HeatmapGrid({ symbols, scores }: HeatmapGridProps) {
  const scale = computeScoreScale(scores);

  return (
    <div className="heatmap">
      <div className="heatmap__legend">
        <div className="heatmap__legend-copy">
          <span className="heatmap__legend-label">Visible co-movement range</span>
          <span className="heatmap__legend-note">
            Coral means the names pull apart, slate is mixed, and blue means they move together.
            Contrast rescales to this visible slice.
          </span>
        </div>

        <div className="heatmap__legend-scale">
          <span className="heatmap__legend-value mono">{formatScore(scale.min, 2)}</span>
          <div className="heatmap__legend-bar" />
          <span className="heatmap__legend-value mono">{formatScore(scale.max, 2)}</span>
        </div>
      </div>

      <div className="heatmap__scroll">
        <div
          className="heatmap-grid"
          style={{
            gridTemplateColumns: `116px repeat(${symbols.length}, minmax(72px, 1fr))`
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
                    title={`${rowSymbol} ↔ ${symbols[colIndex]} · ${describeScore(score, diagonal)} (${formatScore(score, 3)})`}
                  >
                    {diagonal ? '—' : formatScore(score, 2)}
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