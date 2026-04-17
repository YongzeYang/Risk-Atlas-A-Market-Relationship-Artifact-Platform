import { Link } from 'react-router-dom';

import Panel from '../../../../components/ui/Panel';
import StatCard from '../../../../components/ui/StatCard';
import StatusBadge from '../../../../components/ui/StatusBadge';
import { formatDateOnly, formatDateTime, formatDurationMs, formatInteger, formatScoreRange } from '../../../../lib/format';
import type { BuildRunDetailResponse } from '../../../../types/api';

type BuildMetaHeaderProps = {
  detail: BuildRunDetailResponse | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
};

export default function BuildMetaHeader({
  detail,
  loading,
  error,
  refreshing,
  onRefresh
}: BuildMetaHeaderProps) {
  if (loading && !detail) {
    return (
      <Panel>
        <div className="state-note">Loading build metadata…</div>
      </Panel>
    );
  }

  if (error && !detail) {
    return (
      <Panel>
        <div className="state-note state-note--error">{error}</div>
      </Panel>
    );
  }

  if (!detail) {
    return (
      <Panel>
        <div className="state-note">Build detail was not found.</div>
      </Panel>
    );
  }

  return (
    <section className="meta-header">
      <Panel>
        <div className="meta-header__top">
          <div className="meta-header__breadcrumbs">
            <Link to="/" className="button button--ghost button--sm">
              Back to Console
            </Link>
          </div>

          <button type="button" className="button button--ghost button--sm" onClick={onRefresh}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div className="meta-header__title-row">
          <div>
            <div className="meta-header__eyebrow">Analyst Workbench</div>
            <h1 className="meta-header__title mono">Build {detail.id}</h1>
            <p className="meta-header__summary">
              <span className="mono">{detail.datasetId}</span>
              <span>·</span>
              <span className="mono">{detail.universeId}</span>
              <span>·</span>
              <span className="mono">{formatDateOnly(detail.asOfDate)}</span>
              <span>·</span>
              <span className="mono">{detail.windowDays}d</span>
              <span>·</span>
              <span className="mono">{detail.scoreMethod}</span>
            </p>
          </div>

          <div className="meta-header__status">
            <StatusBadge status={detail.status} />
          </div>
        </div>

        {detail.errorMessage ? (
          <div className="state-note state-note--error">{detail.errorMessage}</div>
        ) : null}

        <div className="meta-header__grid">
          <div className="stat-grid">
            <StatCard label="Status" value={detail.status.toUpperCase()} />
            <StatCard label="As of date" value={formatDateOnly(detail.asOfDate)} mono />
            <StatCard label="Window" value={`${detail.windowDays}d`} mono />
            <StatCard label="Symbol count" value={formatInteger(detail.symbolCount)} mono />
            <StatCard label="Created" value={formatDateTime(detail.createdAt)} mono />
            <StatCard label="Duration" value={formatDurationMs(detail.durationMs)} mono />
            <StatCard
              label="Score range"
              value={formatScoreRange(detail.minScore, detail.maxScore)}
              mono
            />
            <StatCard label="Started" value={formatDateTime(detail.startedAt)} mono />
            <StatCard label="Finished" value={formatDateTime(detail.finishedAt)} mono />
          </div>

          <div className="artifact-card">
            <div className="artifact-card__title">Artifact</div>

            {detail.artifact ? (
              <>
                <dl className="artifact-card__meta">
                  <div>
                    <dt>Storage</dt>
                    <dd className="mono">{detail.artifact.storageKind}</dd>
                  </div>
                  <div>
                    <dt>Bundle version</dt>
                    <dd className="mono">v{detail.artifact.bundleVersion}</dd>
                  </div>
                  <div>
                    <dt>Matrix size</dt>
                    <dd className="mono">{formatInteger(detail.artifact.matrixByteSize)}</dd>
                  </div>
                </dl>

                {detail.artifactDownload ? (
                  <a
                    className="button button--primary"
                    href={detail.artifactDownload.url}
                    download={detail.artifactDownload.filename}
                  >
                    Download .bsm
                  </a>
                ) : (
                  <div className="state-note">Artifact download not available.</div>
                )}
              </>
            ) : (
              <div className="state-note">
                Artifact metadata becomes available after the build succeeds.
              </div>
            )}
          </div>
        </div>
      </Panel>
    </section>
  );
}