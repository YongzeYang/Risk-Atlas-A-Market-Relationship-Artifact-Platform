import type { BuildRunScoreMethod } from '../types/api';

export type ScoreMethodOption = {
  value: BuildRunScoreMethod;
  label: string;
  hint: string;
};

export const SCORE_METHOD_OPTIONS: ScoreMethodOption[] = [
  {
    value: 'pearson_corr',
    label: 'Pearson correlation',
    hint: 'Baseline linear co-movement score in [-1, 1].'
  },
  {
    value: 'ewma_corr',
    label: 'EWMA correlation',
    hint: 'Recent days receive higher weight for faster regime tracking.'
  },
  {
    value: 'tail_dep_05',
    label: 'Tail dependence (5%)',
    hint: 'Focuses on shared downside stress events.'
  },
  {
    value: 'nmi_hist_10',
    label: 'Normalized mutual information',
    hint: 'Captures non-linear dependence in [0, 1].'
  }
];

const LABEL_MAP: Record<BuildRunScoreMethod, string> = Object.fromEntries(
  SCORE_METHOD_OPTIONS.map((o) => [o.value, o.label])
) as Record<BuildRunScoreMethod, string>;

export function formatScoreMethodLabel(method: BuildRunScoreMethod): string {
  return LABEL_MAP[method] ?? method;
}
