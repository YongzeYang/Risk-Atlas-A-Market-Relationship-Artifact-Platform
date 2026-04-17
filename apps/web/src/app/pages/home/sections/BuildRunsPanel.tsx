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

export default function BuildRunsPanel({
  buildRuns,
  loading,
  refreshing,
  error,
  lastCreatedBuildId,
  onRefresh
}: BuildRunsPanelProps) {
  return (
    <Panel>
      <SectionHeader
        title="Build Runs"
        subtitle="Newest first. This list polls automatically while runs are active."
        action={
          <button type="button" className="button button--ghost button--sm" onClick={onRefresh}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      {loading ? <div className="state-note">Loading build runs…</div> : null}
      {error ? <div className="state-note state-note--error">{error}</div> : null}

      {!loading && buildRuns.length === 0 ? (
        <div className="state-note">No build runs yet. Queue the first one from the build form.</div>
      ) : null}

      {buildRuns.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Build</th>
                <th>Universe</th>
                <th>As of</th>
                <th>Window</th>
                <th>Method</th>
                <th>Created</th>
                <th>Duration</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {buildRuns.map((buildRun) => (
                <tr
                  key={buildRun.id}
                  className={
                    lastCreatedBuildId === buildRun.id ? 'data-table__row data-table__row--highlight' : 'data-table__row'
                  }
                >
                  <td>
                    <StatusBadge status={buildRun.status} />
                  </td>
                  <td className="mono">{truncateMiddle(buildRun.id, 8, 4)}</td>
                  <td>
                    <div className="table-stack">
                      <span className="mono">{buildRun.universeId}</span>
                      <span className="table-stack__subtle mono">{buildRun.datasetId}</span>
                    </div>
                  </td>
                  <td className="mono">{formatDateOnly(buildRun.asOfDate)}</td>
                  <td className="mono">{buildRun.windowDays}d</td>
                  <td className="mono">{buildRun.scoreMethod}</td>
                  <td className="mono">{formatDateTime(buildRun.createdAt)}</td>
                  <td className="mono">
                    {buildRun.startedAt && buildRun.finishedAt
                      ? formatDurationMs(
                          new Date(buildRun.finishedAt).getTime() - new Date(buildRun.startedAt).getTime()
                        )
                      : '—'}
                  </td>
                  <td className="table-action">
                    <Link to={`/builds/${buildRun.id}`} className="button button--secondary button--sm">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}