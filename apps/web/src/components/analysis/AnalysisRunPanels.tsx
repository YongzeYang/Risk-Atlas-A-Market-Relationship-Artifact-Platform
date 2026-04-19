import type { ReactNode } from 'react';

import StatusBadge from '../ui/StatusBadge';
import { formatDateTime, truncateMiddle } from '../../lib/format';
import type { AnalysisRunDetailResponse, AnalysisRunListItem } from '../../types/api';

type SummaryFormatter = (run: AnalysisRunListItem | AnalysisRunDetailResponse) => string;

type ActiveAnalysisRunPanelProps = {
  run: AnalysisRunDetailResponse | null;
  loading: boolean;
  idleTitle: string;
  idleDescription: string;
  formatSummary: SummaryFormatter;
  action?: ReactNode;
};

type RecentAnalysisRunsPanelProps = {
  runs: AnalysisRunListItem[];
  loading: boolean;
  activeRunId?: string;
  emptyCopy: string;
  formatSummary: SummaryFormatter;
  onSelect: (runId: string) => void;
};

export function ActiveAnalysisRunPanel({
  run,
  loading,
  idleTitle,
  idleDescription,
  formatSummary,
  action
}: ActiveAnalysisRunPanelProps) {
  if (loading && !run) {
    return <div className="state-note">Loading analysis run…</div>;
  }

  if (!run) {
    return (
      <div className="build-state">
        <div className="build-state__eyebrow">No current result</div>
        <h3 className="build-state__title">{idleTitle}</h3>
        <p className="build-state__description">{idleDescription}</p>
      </div>
    );
  }

  return (
    <div className="build-state">
      <div className="build-state__meta">
        <StatusBadge status={run.status} />
        <span className="mono">{truncateMiddle(run.id, 8, 6)}</span>
        <span>Started {formatDateTime(run.createdAt)}</span>
      </div>
      <h3 className="build-state__title">{run.status === 'succeeded' ? 'Result ready' : run.status === 'failed' ? 'Run failed' : 'Preparing…'}</h3>
      <p className="build-state__description">{formatSummary(run)}</p>
      <div className="build-state__meta">
        <span>Started {formatDateTime(run.startedAt)}</span>
        <span>Finished {formatDateTime(run.finishedAt)}</span>
      </div>
      {run.errorMessage ? <div className="state-note state-note--error">{run.errorMessage}</div> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function RecentAnalysisRunsPanel({
  runs,
  loading,
  activeRunId,
  emptyCopy,
  formatSummary,
  onSelect
}: RecentAnalysisRunsPanelProps) {
  if (loading && runs.length === 0) {
    return <div className="state-note">Loading saved analyses…</div>;
  }

  if (runs.length === 0) {
    return <div className="state-note">{emptyCopy}</div>;
  }

  return (
    <div className="recent-run-list">
      {runs.map((run) => (
        <article
          key={run.id}
          className={`recent-run-card${activeRunId === run.id ? ' recent-run-card--active' : ''}`}
        >
          <div className="recent-run-card__header">
            <div className="recent-run-card__identity">
              <StatusBadge status={run.status} />
              <span className="mono recent-run-card__id">{truncateMiddle(run.id, 8, 6)}</span>
            </div>
            <button
              type="button"
              className="button button--secondary button--sm"
              onClick={() => onSelect(run.id)}
            >
              Open
            </button>
          </div>

          <div className="recent-run-card__summary">{formatSummary(run)}</div>
          <div className="recent-run-card__meta">{formatDateTime(run.createdAt)}</div>
        </article>
      ))}
    </div>
  );
}