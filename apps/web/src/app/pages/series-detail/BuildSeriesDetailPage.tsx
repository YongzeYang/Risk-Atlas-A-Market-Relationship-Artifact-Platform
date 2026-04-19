// apps/web/src/app/pages/series-detail/BuildSeriesDetailPage.tsx
import { Link, useParams } from 'react-router-dom';

import Panel from '../../../components/ui/Panel';
import SectionHeader from '../../../components/ui/SectionHeader';
import StatusBadge from '../../../components/ui/StatusBadge';
import { useBuildSeriesDetailData } from '../../../features/builds/hooks';
import { formatDateOnly, formatDateTime } from '../../../lib/format';
import { formatLookbackLabel } from '../../../lib/snapshot-language';
import type { BuildSeriesRunItem } from '../../../types/api';

export default function BuildSeriesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { detail, loading, error } = useBuildSeriesDetailData(id);

  if (loading) {
    return (
      <div className="page page--series-detail">
        <Panel variant="primary">
          <div className="state-note">Loading snapshot series…</div>
        </Panel>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page page--series-detail">
        <Panel variant="primary">
          <div className="state-note state-note--error">{error}</div>
        </Panel>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="page page--series-detail">
        <Panel variant="primary">
          <div className="state-note state-note--error">Snapshot series not found.</div>
        </Panel>
      </div>
    );
  }

  const progress =
    detail.totalRunCount > 0
      ? Math.round(
          ((detail.completedRunCount + detail.failedRunCount) / detail.totalRunCount) * 100
        )
      : 0;

  return (
    <div className="page page--series-detail">
      <Panel variant="primary">
        <SectionHeader
          title={detail.name || detail.id}
          subtitle={`Snapshot series · ${detail.frequency} · ${formatDateOnly(detail.startDate)} → ${formatDateOnly(detail.endDate)}`}
        />

        <div className="series-detail__meta">
          <div className="series-detail__meta-row">
            <StatusBadge status={detail.status} />
            <span className="mono">
              {detail.completedRunCount}/{detail.totalRunCount} snapshots completed ({progress}%)
            </span>
            {detail.failedRunCount > 0 && (
              <span className="mono" style={{ color: 'var(--color-danger, #ef4444)' }}>
                {detail.failedRunCount} failed
              </span>
            )}
          </div>
          <div className="series-detail__meta-row">
            <span>
              <span className="build-stream__meta-label">Lookback</span>
              <span className="mono">{formatLookbackLabel(detail.windowDays)}</span>
            </span>
            <span>
              <span className="build-stream__meta-label">Score method</span>
              <span className="mono">{detail.scoreMethod}</span>
            </span>
            <span>
              <span className="build-stream__meta-label">Created</span>
              <span className="mono">{formatDateTime(detail.createdAt)}</span>
            </span>
          </div>
        </div>
      </Panel>

      <Panel variant="primary">
        <SectionHeader
          title="Snapshots"
          subtitle={`${detail.runs.length} scheduled snapshots in this series`}
        />

        {detail.runs.length === 0 ? (
          <div className="state-note">No snapshots yet.</div>
        ) : (
          <div className="build-stream">
            {detail.runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function RunRow({ run }: { run: BuildSeriesRunItem }) {
  return (
    <Link to={`/builds/${run.id}`} className="build-stream__item build-stream__item--link">
      <div className="build-stream__main">
        <div className="build-stream__topline">
          <StatusBadge status={run.status} />
          <span className="build-stream__scope">
            <span className="mono">{formatDateOnly(run.asOfDate)}</span>
          </span>
        </div>

        <div className="build-stream__meta">
          <span>
            <span className="build-stream__meta-label">Created</span>
            <span className="mono">{formatDateTime(run.createdAt)}</span>
          </span>
          {run.finishedAt && (
            <span>
              <span className="build-stream__meta-label">Finished</span>
              <span className="mono">{formatDateTime(run.finishedAt)}</span>
            </span>
          )}
          {run.errorMessage && (
            <span className="build-stream__meta-label" style={{ color: 'var(--color-danger, #ef4444)' }}>
              {run.errorMessage}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
