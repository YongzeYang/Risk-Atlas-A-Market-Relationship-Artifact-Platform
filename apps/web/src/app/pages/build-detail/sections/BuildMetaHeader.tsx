// apps/web/src/app/pages/build-detail/sections/BuildMetaHeader.tsx
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import Panel from '../../../../components/ui/Panel';
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

function buildInsight(detail: BuildRunDetailResponse, symbolCount: number | null): ReactNode {
  if (detail.status === 'succeeded') {
    const strongestPair = detail.topPairs[0];

    if (strongestPair) {
      return (
        <>
          Strongest pair:{' '}
          <span className="mono">{strongestPair.left}</span>
          {' and '}
          <span className="mono">{strongestPair.right}</span>
          {' at '}
          <span className="mono">{formatScore(strongestPair.score, 3)}</span>.
        </>
      );
    }

    return (
      <>
        Results are ready
        {symbolCount !== null ? ` for ${formatInteger(symbolCount)} symbols.` : '.'}
      </>
    );
  }

  if (detail.status === 'running') {
    return 'This build is running. Results will appear here when the bundle is ready.';
  }

  if (detail.status === 'pending') {
    return 'This build is queued and waiting to start.';
  }

  return 'This build failed. Review the error below.';
}

function buildStats(detail: BuildRunDetailResponse, symbolCount: number | null): SummaryStat[] {
  if (detail.status === 'succeeded') {
    return [
      {
        label: 'As of date',
        value: formatDateOnly(detail.asOfDate),
        mono: true
      },
      {
        label: 'Window',
        value: `${detail.windowDays} day`,
        mono: true
      },
      {
        label: 'Symbols',
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
      label: 'As of date',
      value: formatDateOnly(detail.asOfDate),
      mono: true
    },
    {
      label: 'Window',
      value: `${detail.windowDays} day`,
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
    return 'Bundle details appear when the build is ready.';
  }

  const parts: string[] = ['Bundle ready'];

  if (symbolCount !== null) {
    parts.push(`${formatInteger(symbolCount)} symbols`);
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
        <div className="state-note">Loading build result…</div>
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
        <div className="state-note">Build detail was not found.</div>
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
    `${detail.windowDays}-day window`,
    symbolCount !== null ? `${formatInteger(symbolCount)} symbols` : null
  ].filter((item): item is string => Boolean(item));

  const stats = buildStats(detail, symbolCount);

  return (
    <section className="meta-header">
      <Panel variant="secondary" className="meta-header__panel">
        <div className="meta-header__top">
          <Link to="/" className="button button--ghost button--sm">
            Back to builds
          </Link>

          <button type="button" className="button button--ghost button--sm" onClick={onRefresh}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div className="meta-header__hero">
          <div className="meta-header__copy">
            <h1 className="meta-header__title">Build result</h1>

            <p className="meta-header__summary">
              {summaryItems.map((item, index) => (
                <Fragment key={`${item}-${index}`}>
                  {index > 0 ? <span className="meta-header__summary-separator">·</span> : null}
                  <span className={index === 0 ? 'mono' : ''}>{item}</span>
                </Fragment>
              ))}
            </p>

            <p className="meta-header__insight">{buildInsight(detail, symbolCount)}</p>

            <dl className="meta-header__meta-list">
              <div>
                <dt>Build ID</dt>
                <dd className="mono meta-header__code">{detail.id}</dd>
              </div>

              <div>
                <dt>Dataset</dt>
                <dd className="mono">{detail.datasetId}</dd>
              </div>

              <div>
                <dt>Universe</dt>
                <dd className="mono">{detail.universeId}</dd>
              </div>

              <div>
                <dt>Created</dt>
                <dd className="mono">{formatDateTime(detail.createdAt)}</dd>
              </div>
            </dl>
          </div>

          <div className="meta-header__side">
            <StatusBadge status={detail.status} />

            {detail.status === 'succeeded' && detail.artifactDownload ? (
              <a
                className="button button--primary"
                href={detail.artifactDownload.url}
                download={detail.artifactDownload.filename}
              >
                Download matrix
              </a>
            ) : null}

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
      </Panel>
    </section>
  );
}