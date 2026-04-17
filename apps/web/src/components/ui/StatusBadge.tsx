import type { BuildRunStatus } from '../../types/api';

type StatusBadgeProps = {
  status: BuildRunStatus;
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);

  return <span className={`status-badge status-badge--${status}`}>{label}</span>;
}