// apps/web/src/components/ui/StatusBadge.tsx
import type { BuildRunStatus } from '../../types/api';

type StatusBadgeProps = {
  status: BuildRunStatus;
};

const STATUS_LABELS: Record<BuildRunStatus, string> = {
  pending: 'Queued',
  running: 'Running',
  succeeded: 'Ready',
  failed: 'Failed'
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${status}`}>{STATUS_LABELS[status]}</span>;
}