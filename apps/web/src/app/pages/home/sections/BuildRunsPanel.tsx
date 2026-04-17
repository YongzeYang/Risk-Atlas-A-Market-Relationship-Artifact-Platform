// apps/web/src/app/pages/home/sections/BuildRunsPanel.tsx
import { Link } from 'react-router-dom';

import Panel from '../../../../components/ui/Panel';
import SectionHeader from '../../../../components/ui/SectionHeader';
import StatusBadge from '../../../../components/ui/StatusBadge';
import { formatDateOnly, formatDateTime, formatDurationMs, truncateMiddle } from '../../../../lib/format';
import type { BuildRunListItem } from '../../../../types/api';

type BuildRunsPanelProps = {
  buildRuns: BuildRunListItem[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastCreatedBuildId: string | null;
  onRefresh: () => void;
};

function formatBuildDuration(buildRun: BuildRunListItem): string {
  if (buildRun.startedAt && buildRun.finishedAt) {
    return formatDurationMs(
      new Date(buildRun.finishedAt).getTime() - new Date(buildRun.startedAt).getTime()
    );
  }

  if (buildRun.status === 'running') {
    return 'In progress';
  }

  if (buildRun.status === 'pending') {
    return 'Queued';
  }

  return '—';
}

export default function BuildRunsPanel({
  buildRuns,
  loading,
  refreshing,
  error,
  lastCreatedBuildId,
  onRefresh
}: BuildRunsPanelProps) {
  return (
    <Panel variant="primary">
      <SectionHeader
        title="Recent builds"
        action={
          <button type="button" className="button button--ghost button--sm" onClick={onRefresh}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      {loading ? <div className="state-note">Loading builds…</div> : null}
      {error ? <div className="state-note state-note--error">{error}</div> : null}

      {!loading && buildRuns.length === 0 ? (
        <div className="state-note">No builds yet. Start one from the left.</div>
      ) : null}

      {buildRuns.length > 0 ? (
        <div className="build-stream">
          {buildRuns.map((buildRun) => (
            <article
              key={buildRun.id}
              className={`build-stream__item${
                lastCreatedBuildId === buildRun.id ? ' build-stream__item--highlight' : ''
              }`}
            >
              <div className="build-stream__main">
                <div className="build-stream__topline">
                  <StatusBadge status={buildRun.status} />

                  <div className="build-stream__scope">
                    <span className="mono">{buildRun.universeId}</span>
                    <span className="build-stream__divider">·</span>
                    <span className="mono">{formatDateOnly(buildRun.asOfDate)}</span>
                    <span className="build-stream__divider">·</span>
                    <span>{buildRun.windowDays}-day window</span>
                  </div>
                </div>

                <div className="build-stream__meta">
                  <span>
                    <span className="build-stream__meta-label">Dataset</span>
                    <span className="mono">{buildRun.datasetId}</span>
                  </span>

                  <span>
                    <span className="build-stream__meta-label">Created</span>
                    <span className="mono">{formatDateTime(buildRun.createdAt)}</span>
                  </span>

                  <span>
                    <span className="build-stream__meta-label">Duration</span>
                    <span className="mono">{formatBuildDuration(buildRun)}</span>
                  </span>

                  <span>
                    <span className="build-stream__meta-label">Build</span>
                    <span className="mono">{truncateMiddle(buildRun.id, 8, 6)}</span>
                  </span>
                </div>

                {buildRun.errorMessage ? (
                  <div className="state-note state-note--error build-stream__error">
                    {buildRun.errorMessage}
                  </div>
                ) : null}
              </div>

              <div className="build-stream__action">
                <Link to={`/builds/${buildRun.id}`} className="button button--secondary button--sm">
                  Open build
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}