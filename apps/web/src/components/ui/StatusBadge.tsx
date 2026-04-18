// apps/web/src/components/ui/StatusBadge.tsx
import type { BuildRunStatus, BuildSeriesStatus } from '../../types/api';

type StatusBadgeProps = {
  status: BuildRunStatus | BuildSeriesStatus;
};

const STATUS_LABELS: Record<BuildRunStatus | BuildSeriesStatus, string> = {
  pending: 'Queued',
  running: 'Running',
  succeeded: 'Ready',
  failed: 'Failed',
  partially_failed: 'Partial'
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${status}`}>{STATUS_LABELS[status]}</span>;
}