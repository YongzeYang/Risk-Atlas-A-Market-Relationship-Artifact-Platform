// apps/web/src/app/pages/series-detail/BuildSeriesDetailPage.tsx
import { Link, useParams } from 'react-router-dom';

import BoundaryNote from '../../../components/ui/BoundaryNote';
import Panel from '../../../components/ui/Panel';
import SectionHeader from '../../../components/ui/SectionHeader';
import StatusBadge from '../../../components/ui/StatusBadge';
import { useBuildSeriesDetailData } from '../../../features/builds/hooks';
import { formatDateOnly, formatDateTime, formatInteger } from '../../../lib/format';
import { formatScoreMethodLabel } from '../../../lib/score-method';
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
      <section className="workspace-hero workspace-hero--series-detail">
        <div className="workspace-hero__copy">
          <div className="workspace-hero__eyebrow">Series detail</div>
          <h1 className="workspace-hero__title">{detail.name || 'Snapshot series'}</h1>
          <p className="workspace-hero__description">
            Review how one repeated basket program progressed across time before reopening the individual snapshots inside it.
          </p>
          <p className="workspace-hero__subline">
            {detail.frequency} cadence · {formatDateOnly(detail.startDate)} → {formatDateOnly(detail.endDate)}
          </p>
          <BoundaryNote className="workspace-hero__note" variant="accent">
            Reopen the underlying snapshots when you need interpretation. This page is the time-path ledger for one repeated program.
          </BoundaryNote>
          <div className="workspace-hero__actions">
            <Link to="/series" className="button button--secondary">
              Back to series
            </Link>
            <Link to="/builds" className="button button--ghost">
              Browse snapshots
            </Link>
          </div>
        </div>

        <div className="workspace-hero__stats">
          <article className="workspace-hero__stat-card workspace-hero__stat-card--highlight">
            <div className="workspace-hero__stat-value mono">{progress}%</div>
            <div className="workspace-hero__stat-label">Program progress</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{formatInteger(detail.completedRunCount)}</div>
            <div className="workspace-hero__stat-label">Completed reads</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{formatInteger(detail.totalRunCount)}</div>
            <div className="workspace-hero__stat-label">Scheduled reads</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{formatLookbackLabel(detail.windowDays)}</div>
            <div className="workspace-hero__stat-label">Lookback</div>
          </article>

          <div className="workspace-hero__stat-note">
            <strong>Status:</strong> <StatusBadge status={detail.status} />
            {detail.failedRunCount > 0 ? ` ${detail.failedRunCount} failed read${detail.failedRunCount === 1 ? '' : 's'} are waiting for review.` : ' No failed reads in this program so far.'}
          </div>
        </div>
      </section>

      <Panel variant="primary">
        <SectionHeader
          title="Program metadata"
          subtitle="The cadence, lookback, and creation details that define this repeated read."
        />

        <div className="series-detail__meta">
          <div className="series-detail__meta-row">
            <span>
              <span className="build-stream__meta-label">Score method</span>
              <span className="mono">{formatScoreMethodLabel(detail.scoreMethod)}</span>
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
          title="Scheduled snapshots"
          subtitle={`${detail.runs.length} snapshot${detail.runs.length === 1 ? '' : 's'} are attached to this repeated program.`}
        />

        {detail.runs.length === 0 ? (
          <div className="state-note">No snapshots have been scheduled in this series yet.</div>
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
