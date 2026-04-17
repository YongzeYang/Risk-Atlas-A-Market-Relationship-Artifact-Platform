import { formatScore } from '../../lib/format';

type ScorePillProps = {
  score: number;
};

function scoreTone(score: number): string {
  if (score >= 0.7) {
    return 'score-pill--strong-positive';
  }

  if (score >= 0.2) {
    return 'score-pill--positive';
  }

  if (score <= -0.7) {
    return 'score-pill--strong-negative';
  }

  if (score <= -0.2) {
    return 'score-pill--negative';
  }

  return 'score-pill--neutral';
}

export default function ScorePill({ score }: ScorePillProps) {
  return <span className={`score-pill ${scoreTone(score)}`}>{formatScore(score)}</span>;
}