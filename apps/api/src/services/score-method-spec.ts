import type {
  BuildRunScoreMethod,
  ExposureStrengthBand,
  TopPairItem
} from '../contracts/build-runs.js';

export type ScoreMethodFamily = 'correlation' | 'tail_dependence' | 'mutual_information';
export type TopPairOrdering = 'abs_desc' | 'desc';

export type ScoreMethodSpec = {
  scoreMethod: BuildRunScoreMethod;
  family: ScoreMethodFamily;
  topPairOrdering: TopPairOrdering;
  scoreRange: {
    min: number;
    max: number;
  };
  structureThresholds: readonly number[];
  exposureBandThresholds: {
    veryHigh: number;
    high: number;
    moderate: number;
  };
  supportsPairDivergence: boolean;
};

const SCORE_METHOD_SPECS: Record<BuildRunScoreMethod, ScoreMethodSpec> = {
  pearson_corr: {
    scoreMethod: 'pearson_corr',
    family: 'correlation',
    topPairOrdering: 'abs_desc',
    scoreRange: {
      min: -1,
      max: 1
    },
    structureThresholds: [0.65, 0.55, 0.45, 0.35],
    exposureBandThresholds: {
      veryHigh: 0.8,
      high: 0.6,
      moderate: 0.4
    },
    supportsPairDivergence: true
  },
  ewma_corr: {
    scoreMethod: 'ewma_corr',
    family: 'correlation',
    topPairOrdering: 'abs_desc',
    scoreRange: {
      min: -1,
      max: 1
    },
    structureThresholds: [0.65, 0.55, 0.45, 0.35],
    exposureBandThresholds: {
      veryHigh: 0.8,
      high: 0.6,
      moderate: 0.4
    },
    supportsPairDivergence: true
  },
  tail_dep_05: {
    scoreMethod: 'tail_dep_05',
    family: 'tail_dependence',
    topPairOrdering: 'desc',
    scoreRange: {
      min: 0,
      max: 1
    },
    structureThresholds: [0.45, 0.3, 0.2, 0.12],
    exposureBandThresholds: {
      veryHigh: 0.7,
      high: 0.45,
      moderate: 0.2
    },
    supportsPairDivergence: false
  },
  nmi_hist_10: {
    scoreMethod: 'nmi_hist_10',
    family: 'mutual_information',
    topPairOrdering: 'desc',
    scoreRange: {
      min: 0,
      max: 1
    },
    structureThresholds: [0.5, 0.35, 0.25, 0.15],
    exposureBandThresholds: {
      veryHigh: 0.65,
      high: 0.4,
      moderate: 0.2
    },
    supportsPairDivergence: false
  }
};

export function getScoreMethodSpec(scoreMethod: BuildRunScoreMethod): ScoreMethodSpec {
  return SCORE_METHOD_SPECS[scoreMethod];
}

export function compareTopPairItems(scoreMethod: BuildRunScoreMethod, a: TopPairItem, b: TopPairItem): number {
  const spec = getScoreMethodSpec(scoreMethod);

  if (spec.topPairOrdering === 'abs_desc') {
    const absDiff = Math.abs(b.score) - Math.abs(a.score);
    if (absDiff !== 0) {
      return absDiff;
    }
  } else {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
  }

  const leftCompare = a.left.localeCompare(b.left);
  if (leftCompare !== 0) {
    return leftCompare;
  }

  return a.right.localeCompare(b.right);
}

export function classifyExposureStrength(
  scoreMethod: BuildRunScoreMethod,
  score: number
): ExposureStrengthBand {
  const thresholds = getScoreMethodSpec(scoreMethod).exposureBandThresholds;

  if (score >= thresholds.veryHigh) {
    return 'very_high';
  }

  if (score >= thresholds.high) {
    return 'high';
  }

  if (score >= thresholds.moderate) {
    return 'moderate';
  }

  return 'low';
}