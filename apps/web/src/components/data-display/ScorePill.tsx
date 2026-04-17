// apps/web/src/components/data-display/ScorePill.tsx
import { formatScore } from '../../lib/format';

type ScorePillProps = {
  score: number;
  digits?: number;
};

function scoreTone(score: number): string {
  if (score >= 0.15) {
    return 'score-pill--positive';
  }

  if (score <= -0.15) {
    return 'score-pill--negative';
  }

  return 'score-pill--neutral';
}

export default function ScorePill({ score, digits = 3 }: ScorePillProps) {
  return <span className={`score-pill ${scoreTone(score)}`}>{formatScore(score, digits)}</span>;
}