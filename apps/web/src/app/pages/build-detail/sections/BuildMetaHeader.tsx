// apps/web/src/app/pages/build-detail/sections/BuildMetaHeader.tsx
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import BoundaryNote from '../../../../components/ui/BoundaryNote';
import Panel from '../../../../components/ui/Panel';
import ResearchDetails from '../../../../components/ui/ResearchDetails';
import StatCard from '../../../../components/ui/StatCard';
import StatusBadge from '../../../../components/ui/StatusBadge';
import {
  formatDateOnly,
  formatDateTime,
  formatDurationMs,
  formatInteger,
  formatScore,
  formatScoreRange
} from '../../../../lib/format';
import { formatLookbackLabel } from '../../../../lib/snapshot-language';
import type { BuildRunDetailResponse } from '../../../../types/api';

type BuildMetaHeaderProps = {
  detail: BuildRunDetailResponse | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
};

type SummaryStat = {
  label: string;
  value: string;
  mono?: boolean;
};

function buildConclusion(detail: BuildRunDetailResponse): string | null {
  if (detail.status !== 'succeeded') return null;
  if (detail.minScore != null && detail.maxScore != null && detail.minScore >= 0) {
    return 'This basket looks moderately concentrated rather than fully diversified.';
  }
  if (detail.maxScore != null && detail.maxScore > 0.5) {
    return 'Several names in this snapshot move together strongly enough to deserve a closer look.';
  }
  return 'This basket shows a wide spread of relationship scores — diversification looks present but uneven.';
}

function buildInsight(detail: BuildRunDetailResponse, symbolCount: number | null): ReactNode {
  if (detail.status === 'succeeded') {
    const conclusion = buildConclusion(detail);
    const strongestPair = detail.topPairs[0];

    if (strongestPair) {
      return (
        <>
          {conclusion ? <>{conclusion}{' '}</> : null}
          The tightest relationship is between{' '}
          <span className="mono">{strongestPair.left}</span>
          {' and '}
          <span className="mono">{strongestPair.right}</span>
          {', with a score of '}
          <span className="mono">{formatScore(strongestPair.score, 3)}</span>.
        </>
      );
    }

    return (
      <>
        {conclusion ?? 'This snapshot is ready'}
        {symbolCount !== null ? ` ${formatInteger(symbolCount)} names resolved.` : '.'}
      </>
    );
  }

  if (detail.status === 'running') {
    return 'This snapshot is running. The summary and question-led sections will appear here when the result bundle is ready.';
  }

  if (detail.status === 'pending') {
    return 'This snapshot is preparing. Keep this page open or refresh in a moment.';
  }

  return 'This snapshot failed. Review the error below.';
}

function buildStats(detail: BuildRunDetailResponse, symbolCount: number | null): SummaryStat[] {
  if (detail.status === 'succeeded') {
    return [
      {
        label: 'Snapshot date',
        value: formatDateOnly(detail.asOfDate),
        mono: true
      },
      {
        label: 'Lookback',
        value: formatLookbackLabel(detail.windowDays),
        mono: true
      },
      {
        label: 'Names',
        value: symbolCount !== null ? formatInteger(symbolCount) : '—',
        mono: true
      },
      {
        label: 'Score range',
        value: formatScoreRange(detail.minScore, detail.maxScore),
        mono: true
      }
    ];
  }

  return [
    {
      label: 'Snapshot date',
      value: formatDateOnly(detail.asOfDate),
      mono: true
    },
    {
      label: 'Lookback',
      value: formatLookbackLabel(detail.windowDays),
      mono: true
    },
    {
      label: 'Created',
      value: formatDateTime(detail.createdAt),
      mono: true
    },
    {
      label: 'Duration',
      value: formatDurationMs(detail.durationMs),
      mono: true
    }
  ];
}

function buildBundleNote(detail: BuildRunDetailResponse, symbolCount: number | null): string {
  if (detail.status !== 'succeeded' || !detail.artifact) {
    return 'Downloadable research files appear when the snapshot is ready.';
  }

  const parts: string[] = ['Snapshot files ready'];

  if (symbolCount !== null) {
    parts.push(`${formatInteger(symbolCount)} names`);
  }

  if (detail.artifact.matrixByteSize !== null && detail.artifact.matrixByteSize !== undefined) {
    parts.push(`${formatInteger(detail.artifact.matrixByteSize)} bytes`);
  }

  const message = parts.join(' · ');

  if (!detail.artifactDownload) {
    return `${message}. Download not available yet.`;
  }

  return message;
}

export default function BuildMetaHeader({
  detail,
  loading,
  error,
  refreshing,
  onRefresh
}: BuildMetaHeaderProps) {
  if (loading && !detail) {
    return (
      <Panel variant="secondary">
        <div className="state-note">Loading snapshot…</div>
      </Panel>
    );
  }

  if (error && !detail) {
    return (
      <Panel variant="secondary">
        <div className="state-note state-note--error">{error}</div>
      </Panel>
    );
  }

  if (!detail) {
    return (
      <Panel variant="secondary">
        <div className="state-note">Snapshot detail was not found.</div>
      </Panel>
    );
  }

  const symbolCount =
    detail.symbolCount ??
    detail.artifact?.symbolCount ??
    (detail.symbolOrder.length > 0 ? detail.symbolOrder.length : null);

  const summaryItems = [
    detail.universeId,
    formatDateOnly(detail.asOfDate),
    formatLookbackLabel(detail.windowDays),
    symbolCount !== null ? `${formatInteger(symbolCount)} names` : null
  ].filter((item): item is string => Boolean(item));

  const stats = buildStats(detail, symbolCount);

  return (
    <section className="meta-header">
      <Panel variant="secondary" className="meta-header__panel">
        <div className="meta-header__top">
          <Link to="/builds" className="button button--ghost button--sm">
            Back to snapshots
          </Link>

          <div className="toolbar-inline">
            {detail.status === 'succeeded' ? (
              <>
                <Link to={`/compare?left=${detail.id}`} className="button button--ghost button--sm">
                  What changed
                </Link>
                <Link to={`/divergence?build=${detail.id}`} className="button button--ghost button--sm">
                  Relationships
                </Link>
                <Link to={`/exposure?build=${detail.id}`} className="button button--ghost button--sm">
                  Spillover
                </Link>
                <Link to={`/structure?build=${detail.id}`} className="button button--ghost button--sm">
                  Groups
                </Link>
              </>
            ) : null}

            <button type="button" className="button button--ghost button--sm" onClick={onRefresh}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="meta-header__hero">
          <div className="meta-header__copy">
            <h1 className="meta-header__title">Snapshot</h1>

            <p className="meta-header__summary">
              {summaryItems.map((item, index) => (
                <Fragment key={`${item}-${index}`}>
                  {index > 0 ? <span className="meta-header__summary-separator">·</span> : null}
                  <span className={index === 0 ? 'mono' : ''}>{item}</span>
                </Fragment>
              ))}
            </p>

            <p className="meta-header__insight">{buildInsight(detail, symbolCount)}</p>

            <BoundaryNote variant="accent">
              Use this page for the first read: hidden concentration, strong relationships, name-level spillover,
              and whether you should move on to groups or comparison.
            </BoundaryNote>
          </div>

          <div className="meta-header__side">
            <StatusBadge status={detail.status} />

            <div className="meta-header__side-note">
              {buildBundleNote(detail, symbolCount)}
            </div>
          </div>
        </div>

        {detail.errorMessage ? (
          <div className="state-note state-note--error meta-header__error">{detail.errorMessage}</div>
        ) : null}

        <div className="stat-grid">
          {stats.map((stat) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              mono={stat.mono}
            />
          ))}
        </div>

        <ResearchDetails summary="Advanced details and downloads">
          <dl className="meta-header__meta-list">
            <div>
              <dt>Snapshot ID</dt>
              <dd className="mono meta-header__code">{detail.id}</dd>
            </div>

            <div>
              <dt>Data source</dt>
              <dd className="mono">{detail.datasetId}</dd>
            </div>

            <div>
              <dt>Basket</dt>
              <dd className="mono">{detail.universeId}</dd>
            </div>

            <div>
              <dt>Created</dt>
              <dd className="mono">{formatDateTime(detail.createdAt)}</dd>
            </div>
          </dl>

          {detail.status === 'succeeded' && detail.artifactDownload ? (
            <a
              className="button button--secondary button--sm"
              href={detail.artifactDownload.url}
              download={detail.artifactDownload.filename}
            >
              Download matrix file
            </a>
          ) : null}
        </ResearchDetails>
      </Panel>
    </section>
  );
}