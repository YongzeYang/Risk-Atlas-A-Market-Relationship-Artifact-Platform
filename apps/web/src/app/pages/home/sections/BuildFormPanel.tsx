// apps/web/src/app/pages/home/sections/BuildFormPanel.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import Panel from '../../../../components/ui/Panel';
import SectionHeader from '../../../../components/ui/SectionHeader';
import StatusBadge from '../../../../components/ui/StatusBadge';
import { createBuildRun } from '../../../../features/builds/api';
import { useBuildRequestValidation, useInviteCode } from '../../../../features/builds/hooks';
import { getEarliestBuildableAsOfDate } from '../../../../lib/build-dates';
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

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === datasetId) ?? null,
    [datasetId, datasets]
  );
  const selectedUniverse = useMemo(
    () => universes.find((universe) => universe.id === universeId) ?? null,
    [universeId, universes]
  );
  const minAsOfDate = useMemo(
    () => getEarliestBuildableAsOfDate(selectedDataset, windowDays),
    [selectedDataset, windowDays]
  );

  const compatibleUniverses = useMemo(
    () =>
      universes.filter((universe) => {
        if (!selectedDataset) {
          return true;
        }

        if (universe.market !== selectedDataset.market) {
          return false;
        }

        if (universe.supportedDatasetIds === null) {
          return true;
        }

        return universe.supportedDatasetIds.includes(selectedDataset.id);
      }),
    [selectedDataset, universes]
  );
  const {
    validation: buildValidation,
    validating: buildValidating,
    error: buildValidationError
  } = useBuildRequestValidation({
    datasetId,
    universeId,
    asOfDate,
    windowDays,
    enabled: Boolean(datasetId && universeId && asOfDate && compatibleUniverses.length > 0)
  });

  useEffect(() => {
    if (compatibleUniverses.length === 0) {
      if (universeId) {
        setUniverseId('');
      }
      return;
    }

    if (!universeId || !compatibleUniverses.some((universe) => universe.id === universeId)) {
      setUniverseId(compatibleUniverses[0].id);
    }
  }, [compatibleUniverses, universeId]);

  useEffect(() => {
    if (selectedDataset?.maxTradeDate) {
      setAsOfDate(selectedDataset.maxTradeDate);
      return;
    }

    setAsOfDate('');
  }, [selectedDataset?.id, selectedDataset?.maxTradeDate]);

  useEffect(() => {
    const maxTradeDate = selectedDataset?.maxTradeDate;
    if (!maxTradeDate || !minAsOfDate) {
      return;
    }

    setAsOfDate((current) => {
      if (!current) {
        return maxTradeDate;
      }

      if (current < minAsOfDate) {
        return minAsOfDate;
      }

      if (current > maxTradeDate) {
        return maxTradeDate;
      }

      return current;
    });
  }, [minAsOfDate, selectedDataset?.maxTradeDate]);

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
                )}` +
                (minAsOfDate ? ` · earliest ${windowDays}d build ${formatDateOnly(minAsOfDate)}` : '')
              : 'Select one dataset.'}
          </span>
        </label>

        <label className="field">
          <span className="field__label">Universe</span>
          <select
            className="field__control mono"
            value={universeId}
            onChange={(event) => setUniverseId(event.target.value)}
            disabled={loading || submitting || compatibleUniverses.length === 0}
          >
            {compatibleUniverses.map((universe) => (
              <option key={universe.id} value={universe.id}>
                {universe.id}
              </option>
            ))}
          </select>

          <span className="field__hint">
            {(() => {
              if (!selectedUniverse) return 'Select one universe.';
              const kind = selectedUniverse.definitionKind === 'static' ? 'static' : 'dynamic';

              if (buildValidation?.valid && buildValidation.resolvedSymbolCount != null) {
                return `${selectedUniverse.name} · ${kind} · ${buildValidation.resolvedSymbolCount} matrix-ready symbols at this date`;
              }

              const count =
                selectedUniverse.symbolCount != null
                  ? `${selectedUniverse.symbolCount} symbols`
                  : 'resolved against the selected dataset/date';
              return `${selectedUniverse.name} · ${kind} · ${count}`;
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
            min={minAsOfDate ?? selectedDataset?.minTradeDate ?? undefined}
            max={selectedDataset?.maxTradeDate ?? undefined}
            disabled={loading || submitting}
          />

          <span className="field__hint">
            {buildValidation?.valid && buildValidation.resolvedSymbolCount != null
              ? `Uses daily log returns ending on this trading date. Resolved ${buildValidation.resolvedSymbolCount} matrix-ready symbols after row, alignment, and flat-series filtering.`
              : minAsOfDate
                ? `Uses daily log returns ending on this trading date. Earliest ${windowDays}d buildable date: ${formatDateOnly(minAsOfDate)}.`
                : 'Uses daily log returns ending on this trading date.'}
          </span>
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

        {compatibleUniverses.length === 0 ? (
          <div className="state-note state-note--error">
            No compatible universes are available for dataset "{selectedDataset?.id ?? datasetId}".
          </div>
        ) : null}

        {buildValidating ? (
          <div className="state-note">Checking matrix-ready coverage, alignment, and resolved universe size…</div>
        ) : null}

        {!buildValidating && buildValidationError ? (
          <div className="state-note state-note--error">{buildValidationError}</div>
        ) : null}

        {!buildValidating && buildValidation && !buildValidation.valid && buildValidation.message ? (
          <div className="state-note state-note--error">{buildValidation.message}</div>
        ) : null}

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
            disabled={
              loading ||
              submitting ||
              !datasetId ||
              !universeId ||
              !asOfDate ||
              !inviteCode ||
              compatibleUniverses.length === 0 ||
              buildValidating ||
              !buildValidation?.valid
            }
          >
            {submitting ? 'Starting build…' : 'Start build'}
          </button>
        </div>
      </form>
    </Panel>
  );
}