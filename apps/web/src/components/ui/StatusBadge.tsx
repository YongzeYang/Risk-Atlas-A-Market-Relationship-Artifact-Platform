// apps/web/src/components/ui/StatusBadge.tsx
import type { AnalysisRunStatus, BuildRunStatus, BuildSeriesStatus } from '../../types/api';

type StatusBadgeProps = {
  status: BuildRunStatus | BuildSeriesStatus | AnalysisRunStatus;
};

const STATUS_LABELS: Record<BuildRunStatus | BuildSeriesStatus | AnalysisRunStatus, string> = {
  pending: 'Preparing',
  running: 'Running',
  succeeded: 'Ready',
  failed: 'Failed',
  partially_failed: 'Partial'
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${status}`}>{STATUS_LABELS[status]}</span>;
}