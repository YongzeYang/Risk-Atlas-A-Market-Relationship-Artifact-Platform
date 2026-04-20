// apps/web/src/app/pages/home/sections/BuildRunsPanel.tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import Panel from '../../../../components/ui/Panel';
import SectionHeader from '../../../../components/ui/SectionHeader';
import StatusBadge from '../../../../components/ui/StatusBadge';
import { describeSnapshotHint, summarizeBuildFailure } from '../../../../lib/build-run-language';
import { formatDateOnly, formatDateTime, formatDurationMs, truncateMiddle } from '../../../../lib/format';
import { formatScoreMethodLabel } from '../../../../lib/score-method';
import { formatLookbackLabel } from '../../../../lib/snapshot-language';
import type { BuildRunListItem } from '../../../../types/api';

type BuildRunsPanelProps = {
  buildRuns: BuildRunListItem[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastCreatedBuildId?: string | null;
  onRefresh: () => void;
  title?: string;
  subtitle?: string;
  emptyStateCopy?: string;
  action?: ReactNode;
  universeLabels?: Record<string, string>;
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
    return 'Preparing';
  }

  return '—';
}

export default function BuildRunsPanel({
  buildRuns,
  loading,
  refreshing,
  error,
  lastCreatedBuildId = null,
  onRefresh,
  title = 'Recent snapshots',
  subtitle,
  emptyStateCopy = 'No snapshots yet. Create one to start reading the market in this format.',
  action,
  universeLabels = {}
}: BuildRunsPanelProps) {
  return (
    <Panel variant="primary">
      <SectionHeader
        title={title}
        subtitle={subtitle}
        action={action ?? (
          <button type="button" className="button button--ghost button--sm" onClick={onRefresh}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      />

      {loading ? <div className="state-note">Loading snapshots…</div> : null}
      {error ? <div className="state-note state-note--error">{error}</div> : null}

      {!loading && buildRuns.length === 0 ? (
        <div className="state-note">{emptyStateCopy}</div>
      ) : null}

      {buildRuns.length > 0 ? (
        <div className="build-stream">
          {buildRuns.map((buildRun) => {
            const universeLabel = universeLabels[buildRun.universeId] ?? buildRun.universeId;
            const actionLabel = buildRun.status === 'succeeded' ? 'Open snapshot' : 'Open details';

            return (
              <article
                key={buildRun.id}
                className={`build-stream__item${
                  lastCreatedBuildId === buildRun.id ? ' build-stream__item--highlight' : ''
                }`}
              >
                <div className="build-stream__main">
                  <div className="build-stream__topline">
                    <StatusBadge status={buildRun.status} />
                    <div className="build-stream__title">{universeLabel}</div>
                  </div>

                  <div className="build-stream__scope">
                    <span>Snapshot date {formatDateOnly(buildRun.asOfDate)}</span>
                    <span className="build-stream__divider">·</span>
                    <span>{formatLookbackLabel(buildRun.windowDays)}</span>
                    <span className="build-stream__divider">·</span>
                    <span className="build-stream__method">{formatScoreMethodLabel(buildRun.scoreMethod)}</span>
                  </div>

                  <div className="build-stream__summary">
                    {describeSnapshotHint(buildRun, universeLabel)}
                  </div>

                  <div className="build-stream__meta">
                    {universeLabel !== buildRun.universeId ? (
                      <span>
                        <span className="build-stream__meta-label">Basket code</span>
                        <span className="mono">{buildRun.universeId}</span>
                      </span>
                    ) : null}

                    <span>
                      <span className="build-stream__meta-label">Created</span>
                      <span className="mono">{formatDateTime(buildRun.createdAt)}</span>
                    </span>

                    <span>
                      <span className="build-stream__meta-label">Run time</span>
                      <span className="mono">{formatBuildDuration(buildRun)}</span>
                    </span>

                    <span>
                      <span className="build-stream__meta-label">Snapshot ID</span>
                      <span className="mono">{truncateMiddle(buildRun.id, 8, 6)}</span>
                    </span>
                  </div>

                  {buildRun.errorMessage ? (
                    <div className="build-stream__secondary-note">
                      {summarizeBuildFailure(buildRun.errorMessage)}
                    </div>
                  ) : null}
                </div>

                <div className="build-stream__action">
                  <Link to={`/builds/${buildRun.id}`} className="button button--secondary button--sm">
                    {actionLabel}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </Panel>
  );
}