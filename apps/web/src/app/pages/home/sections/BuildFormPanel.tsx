// apps/web/src/app/pages/home/sections/BuildFormPanel.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import Panel from '../../../../components/ui/Panel';
import SectionHeader from '../../../../components/ui/SectionHeader';
import StatusBadge from '../../../../components/ui/StatusBadge';
import { createBuildRun } from '../../../../features/builds/api';
import { useInviteCode } from '../../../../features/builds/hooks';
import { formatDateOnly } from '../../../../lib/format';
import type {
  BuildRunListItem,
  BuildRunWindowDays,
  BuildRunScoreMethod,
  CreateBuildRunInput,
  DatasetListItem,
  UniverseListItem
} from '../../../../types/api';

type BuildFormPanelProps = {
  datasets: DatasetListItem[];
  universes: UniverseListItem[];
  loading: boolean;
  error: string | null;
  onBuildCreated: (buildRun: BuildRunListItem) => void;
};

const WINDOW_OPTIONS: BuildRunWindowDays[] = [60, 120, 252];
const SCORE_METHOD: BuildRunScoreMethod = 'pearson_corr';

export default function BuildFormPanel({
  datasets,
  universes,
  loading,
  error,
  onBuildCreated
}: BuildFormPanelProps) {
  const [datasetId, setDatasetId] = useState('');
  const [universeId, setUniverseId] = useState('');
  const [asOfDate, setAsOfDate] = useState('');
  const [windowDays, setWindowDays] = useState<BuildRunWindowDays>(252);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdBuild, setCreatedBuild] = useState<BuildRunListItem | null>(null);
  const { inviteCode, setInviteCode } = useInviteCode();

  useEffect(() => {
    if (!datasetId && datasets.length > 0) {
      setDatasetId(datasets[0].id);
    }
  }, [datasetId, datasets]);

  useEffect(() => {
    if (!universeId && universes.length > 0) {
      setUniverseId(universes[0].id);
    }
  }, [universeId, universes]);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === datasetId) ?? null,
    [datasetId, datasets]
  );

  useEffect(() => {
    if (selectedDataset?.maxTradeDate) {
      setAsOfDate(selectedDataset.maxTradeDate);
    }
  }, [selectedDataset?.id, selectedDataset?.maxTradeDate]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload: CreateBuildRunInput = {
      datasetId,
      universeId,
      asOfDate,
      windowDays,
      scoreMethod: SCORE_METHOD,
      inviteCode
    };

    setSubmitting(true);
    setSubmitError(null);

    try {
      const created = await createBuildRun(payload);
      setCreatedBuild(created);
      onBuildCreated(created);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to start build.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Panel variant="primary" className="build-form-panel">
      <div id="create-build" />

      <SectionHeader
        title="New build"
        subtitle="Choose a dataset, a universe, and a date."
      />

      {loading ? <div className="state-note">Loading available data…</div> : null}
      {error ? <div className="state-note state-note--error">{error}</div> : null}

      {createdBuild ? (
        <div className="inline-callout">
          <div className="inline-callout__meta">
            <StatusBadge status={createdBuild.status} />
            <span className="mono">{createdBuild.id}</span>
          </div>

          <div className="inline-callout__body">
            Build started. You can open it now while it runs.
          </div>

          <Link to={`/builds/${createdBuild.id}`} className="button button--secondary button--sm">
            Open build
          </Link>
        </div>
      ) : null}

      <form className="form-grid" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Dataset</span>
          <select
            className="field__control mono"
            value={datasetId}
            onChange={(event) => setDatasetId(event.target.value)}
            disabled={loading || submitting || datasets.length === 0}
          >
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.id}
              </option>
            ))}
          </select>

          <span className="field__hint">
            {selectedDataset
              ? `${selectedDataset.name} · ${formatDateOnly(selectedDataset.minTradeDate)} → ${formatDateOnly(
                  selectedDataset.maxTradeDate
                )}`
              : 'Select one dataset.'}
          </span>
        </label>

        <label className="field">
          <span className="field__label">Universe</span>
          <select
            className="field__control mono"
            value={universeId}
            onChange={(event) => setUniverseId(event.target.value)}
            disabled={loading || submitting || universes.length === 0}
          >
            {universes.map((universe) => (
              <option key={universe.id} value={universe.id}>
                {universe.id}
              </option>
            ))}
          </select>

          <span className="field__hint">
            {(() => {
              const u = universes.find((item) => item.id === universeId);
              if (!u) return 'Select one universe.';
              const kind = u.definitionKind === 'static' ? 'static' : 'dynamic';
              const count = u.symbolCount != null ? `${u.symbolCount} symbols` : 'resolved at build time';
              return `${u.name} · ${kind} · ${count}`;
            })()}
          </span>
        </label>

        <label className="field">
          <span className="field__label">As of date</span>
          <input
            className="field__control mono"
            type="date"
            value={asOfDate}
            onChange={(event) => setAsOfDate(event.target.value)}
            disabled={loading || submitting}
          />

          <span className="field__hint">Uses daily log returns ending on this trading date.</span>
        </label>

        <div className="form-grid__inline">
          <label className="field">
            <span className="field__label">Window</span>
            <select
              className="field__control mono"
              value={windowDays}
              onChange={(event) => setWindowDays(Number(event.target.value) as BuildRunWindowDays)}
              disabled={loading || submitting}
            >
              {WINDOW_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  {days} days
                </option>
              ))}
            </select>
          </label>

          <div className="field">
            <span className="field__label">Method</span>

            <div className="field__static">
              <div className="field__static-title">Pearson correlation</div>
              <div className="field__static-copy">Fixed in V1</div>
            </div>
          </div>
        </div>

        {submitError ? <div className="state-note state-note--error">{submitError}</div> : null}

        <label className="field">
          <span className="field__label">Invite code</span>
          <input
            className="field__control mono"
            type="text"
            placeholder="Enter invite code"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            disabled={loading || submitting}
            autoComplete="off"
          />
          <span className="field__hint">Required. Your code is saved in the browser.</span>
        </label>

        <div className="form-actions">
          <button
            type="submit"
            className="button button--primary"
            disabled={loading || submitting || !datasetId || !universeId || !asOfDate || !inviteCode}
          >
            {submitting ? 'Starting build…' : 'Start build'}
          </button>
        </div>
      </form>
    </Panel>
  );
}