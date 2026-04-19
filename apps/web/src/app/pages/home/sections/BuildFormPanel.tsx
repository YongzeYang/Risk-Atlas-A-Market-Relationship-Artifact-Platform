// apps/web/src/app/pages/home/sections/BuildFormPanel.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import BoundaryNote from '../../../../components/ui/BoundaryNote';
import Panel from '../../../../components/ui/Panel';
import ResearchDetails from '../../../../components/ui/ResearchDetails';
import SectionHeader from '../../../../components/ui/SectionHeader';
import StatusBadge from '../../../../components/ui/StatusBadge';
import { createBuildRun } from '../../../../features/builds/api';
import { useBuildRequestValidation, useInviteCode } from '../../../../features/builds/hooks';
import { getEarliestBuildableAsOfDate } from '../../../../lib/build-dates';
import { formatDateOnly } from '../../../../lib/format';
import {
  describeBasketKind,
  describeCoverageCount,
  formatLookbackLabel
} from '../../../../lib/snapshot-language';
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
  datasetsLoading: boolean;
  universesLoading: boolean;
  error: string | null;
  onBuildCreated: (buildRun: BuildRunListItem) => void;
};

const WINDOW_OPTIONS: BuildRunWindowDays[] = [60, 120, 252];
const SCORE_METHOD: BuildRunScoreMethod = 'pearson_corr';

export default function BuildFormPanel({
  datasets,
  universes,
  loading,
  datasetsLoading,
  universesLoading,
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
  const validationFeedback = useMemo(
    () => buildFriendlyValidationFeedback(buildValidation, selectedDataset?.name ?? null),
    [buildValidation, selectedDataset?.name]
  );
  const validationErrorFeedback = useMemo(() => {
    if (!buildValidationError) {
      return null;
    }

    return {
      summary: 'We could not check this setup right now.',
      nextStep: 'Try again in a moment, or adjust the basket, date, or lookback.',
      detail: buildValidationError
    };
  }, [buildValidationError]);
  const submitErrorFeedback = useMemo(
    () => buildFriendlySubmitError(submitError, selectedDataset?.name ?? null),
    [selectedDataset?.name, submitError]
  );

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
      setSubmitError(err instanceof Error ? err.message : 'Failed to create snapshot.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Panel variant="primary" className="build-form-panel">
      <div id="create-build" />

      <SectionHeader
        title="Snapshot setup"
        subtitle="Pick one market basket, one snapshot date, and one lookback. Research details stay below."
      />

      {loading && datasets.length === 0 && universes.length === 0 ? (
        <div className="state-note">Loading available data…</div>
      ) : null}
      {error ? <div className="state-note state-note--error">{error}</div> : null}

      <BoundaryNote title="What this does" variant="accent">
        A snapshot captures how this market basket moved together over the chosen lookback ending on the chosen date.
        Start with one clean read. Compare later only if your real question is what changed.
      </BoundaryNote>

      {createdBuild ? (
        <div className="inline-callout">
          <div className="inline-callout__meta">
            <StatusBadge status={createdBuild.status} />
            <span>{selectedUniverse?.name ?? createdBuild.universeId}</span>
            <span className="build-stream__divider">·</span>
            <span className="mono">{formatDateOnly(createdBuild.asOfDate)}</span>
            <span className="build-stream__divider">·</span>
            <span>{formatLookbackLabel(createdBuild.windowDays)}</span>
          </div>

          <div className="inline-callout__body">
            Your snapshot is being prepared. You can open it now or come back when the read is ready.
          </div>

          <ResearchDetails summary="Snapshot details">
            <div className="workspace-note-list">
              <div className="workspace-note-list__item">Snapshot ID: {createdBuild.id}</div>
            </div>
          </ResearchDetails>

          <Link to={`/builds/${createdBuild.id}`} className="button button--secondary button--sm">
            Open snapshot
          </Link>
        </div>
      ) : null}

      <form className="form-grid" onSubmit={handleSubmit}>
        {datasets.length > 1 ? (
          <label className="field">
            <span className="field__label">Data source</span>
            <select
              className="field__control mono"
              value={datasetId}
              onChange={(event) => setDatasetId(event.target.value)}
              disabled={datasetsLoading || submitting || datasets.length === 0}
            >
              {datasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.name}
                </option>
              ))}
            </select>

            <span className="field__hint">
              {datasetsLoading && datasets.length === 0
                ? 'Loading data sources…'
                : selectedDataset
                  ? `${selectedDataset.name} · ${formatDateOnly(selectedDataset.minTradeDate)} → ${formatDateOnly(
                      selectedDataset.maxTradeDate
                    )}` +
                    (minAsOfDate ? ` · earliest ${formatLookbackLabel(windowDays)} ${formatDateOnly(minAsOfDate)}` : '')
                  : 'Select one data source.'}
            </span>
          </label>
        ) : null}

        <label className="field">
          <span className="field__label">Market basket</span>
          <select
            className="field__control mono"
            value={universeId}
            onChange={(event) => setUniverseId(event.target.value)}
            disabled={universesLoading || submitting || compatibleUniverses.length === 0}
          >
            {compatibleUniverses.map((universe) => (
              <option key={universe.id} value={universe.id}>
                {universe.name}
              </option>
            ))}
          </select>

          <span className="field__hint">
            {universesLoading && universes.length === 0
              ? 'Loading baskets…'
              : (() => {
                  if (!selectedUniverse) return 'Select one market basket.';
                  const kind = describeBasketKind(selectedUniverse.definitionKind);

                  if (buildValidation?.valid && buildValidation.resolvedSymbolCount != null) {
                    return `${selectedUniverse.name} · ${kind} · ${buildValidation.resolvedSymbolCount} usable names on this date`;
                  }

                  return `${selectedUniverse.name} · ${kind} · ${describeCoverageCount(selectedUniverse.symbolCount)}`;
                })()}
          </span>
        </label>

        <label className="field">
          <span className="field__label">Snapshot date</span>
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
              ? `This setup is ready to build and currently resolves to ${buildValidation.resolvedSymbolCount} usable names.`
              : minAsOfDate
                ? `Use the date you want this market read to end on. Earliest ${formatLookbackLabel(windowDays)} snapshot: ${formatDateOnly(minAsOfDate)}.`
                : 'Use the date you want this market read to end on.'}
          </span>
        </label>

        <label className="field">
          <span className="field__label">Lookback</span>
          <select
            className="field__control mono"
            value={windowDays}
            onChange={(event) => setWindowDays(Number(event.target.value) as BuildRunWindowDays)}
            disabled={loading || submitting}
          >
            {WINDOW_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {formatLookbackLabel(days)}
              </option>
            ))}
          </select>
          <span className="field__hint">
            Shorter lookbacks stay closer to recent behaviour. Longer lookbacks show steadier structure.
          </span>
        </label>

        {!universesLoading && compatibleUniverses.length === 0 ? (
          <div className="state-note state-note--error">
            This data source does not currently support a buildable market basket here. Try a different source or basket.
          </div>
        ) : null}

        {buildValidating ? (
          <div className="state-note">
            Checking whether this snapshot can be built from the selected basket, date, and lookback…
          </div>
        ) : null}

        {!buildValidating && validationErrorFeedback ? (
          <div className="state-note state-note--error">
            {validationErrorFeedback.summary} {validationErrorFeedback.nextStep}
          </div>
        ) : null}

        {!buildValidating && validationFeedback ? (
          <div className="state-note state-note--error">
            {validationFeedback.summary} {validationFeedback.nextStep}
          </div>
        ) : null}

        {!buildValidating && buildValidation?.valid && buildValidation.resolvedSymbolCount != null ? (
          <div className="state-note">
            Ready to build. This setup currently resolves to {buildValidation.resolvedSymbolCount} usable names.
          </div>
        ) : null}

        {submitErrorFeedback ? (
          <div className="state-note state-note--error">
            {submitErrorFeedback.summary} {submitErrorFeedback.nextStep}
          </div>
        ) : null}

        <label className="field">
          <span className="field__label">Invite code</span>
          <input
            className="field__control mono"
            type="text"
            placeholder="Needed to create a snapshot"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            disabled={loading || submitting}
            autoComplete="off"
          />
          <span className="field__hint">Needed only when you create a new snapshot. Saved in this browser for convenience.</span>
        </label>

        <ResearchDetails summary="Research details">
          <div className="workspace-note-list">
            {datasets.length === 1 && selectedDataset ? (
              <div className="workspace-note-list__item">
                Data source: {selectedDataset.name} · {formatDateOnly(selectedDataset.minTradeDate)} → {formatDateOnly(selectedDataset.maxTradeDate)}
                {minAsOfDate ? ` · earliest ${formatLookbackLabel(windowDays)} ${formatDateOnly(minAsOfDate)}` : ''}
              </div>
            ) : null}
            <div className="workspace-note-list__item">Method is fixed to Pearson correlation in this release so snapshots stay comparable across screens.</div>
            <div className="workspace-note-list__item">The basket first resolves against the chosen source and date, then the engine removes flat or unusable return series before matrix generation.</div>
            <div className="workspace-note-list__item">A snapshot is descriptive. It helps you see concentration, relationships, spillover, and hidden groups, but it is not a direct forecast.</div>
          </div>
        </ResearchDetails>

        {validationFeedback?.detail || validationErrorFeedback?.detail || submitErrorFeedback?.detail ? (
          <ResearchDetails summary="Validation details">
            <div className="workspace-note-list">
              {validationFeedback?.detail ? (
                <div className="workspace-note-list__item">{validationFeedback.detail}</div>
              ) : null}
              {validationFeedback?.requiredRows ? (
                <div className="workspace-note-list__item">
                  This lookback needs at least {validationFeedback.requiredRows} rows per symbol.
                </div>
              ) : null}
              {validationErrorFeedback?.detail ? (
                <div className="workspace-note-list__item">{validationErrorFeedback.detail}</div>
              ) : null}
              {submitErrorFeedback?.detail ? (
                <div className="workspace-note-list__item">{submitErrorFeedback.detail}</div>
              ) : null}
            </div>
          </ResearchDetails>
        ) : null}

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
            {submitting ? 'Creating snapshot…' : 'Create snapshot'}
          </button>
        </div>
      </form>
    </Panel>
  );
}

function buildFriendlyValidationFeedback(
  validation: ReturnType<typeof useBuildRequestValidation>['validation'],
  datasetName: string | null
) {
  if (!validation || validation.valid) {
    return null;
  }

  switch (validation.reasonCode) {
    case 'insufficient_history':
      return {
        summary: `This basket can’t be built from ${datasetName ?? 'the selected data source'} on ${formatDateOnly(
          validation.asOfDate
        )} with a ${validation.windowDays}-day lookback.`,
        nextStep: 'Try a later date, a shorter lookback, or a different market basket.',
        detail: validation.message,
        requiredRows: validation.requiredRows
      };
    case 'universe_size':
      return {
        summary: 'This setup does not leave enough usable names for a clean snapshot.',
        nextStep: 'Try a broader basket, a later date, or a shorter lookback.',
        detail: validation.message,
        requiredRows: validation.requiredRows
      };
    case 'market_mismatch':
      return {
        summary: 'This market basket does not match the selected data source.',
        nextStep: 'Choose a basket and data source from the same market.',
        detail: validation.message,
        requiredRows: validation.requiredRows
      };
    case 'dataset_not_found':
      return {
        summary: 'The selected data source is not available right now.',
        nextStep: 'Refresh the page and choose another source if needed.',
        detail: validation.message,
        requiredRows: validation.requiredRows
      };
    case 'universe_not_found':
      return {
        summary: 'The selected market basket is not available right now.',
        nextStep: 'Refresh the page and choose another basket if needed.',
        detail: validation.message,
        requiredRows: validation.requiredRows
      };
    default:
      return {
        summary: 'This snapshot could not be validated with the current setup.',
        nextStep: 'Try adjusting the basket, date, or lookback.',
        detail: validation.message,
        requiredRows: validation.requiredRows
      };
  }
}

function buildFriendlySubmitError(errorMessage: string | null, datasetName: string | null) {
  if (!errorMessage) {
    return null;
  }

  if (/invite code is required/i.test(errorMessage)) {
    return {
      summary: 'Enter your invite code to create a snapshot.',
      nextStep: 'Browsing and comparison stay open without it.',
      detail: errorMessage
    };
  }

  if (/invalid invite code/i.test(errorMessage)) {
    return {
      summary: 'That invite code did not work.',
      nextStep: 'Check the code and try again.',
      detail: errorMessage
    };
  }

  if (/insufficient history|not enough history/i.test(errorMessage)) {
    return {
      summary: `This basket can’t be built from ${datasetName ?? 'the selected data source'} with the current date and lookback.`,
      nextStep: 'Try a later date, a shorter lookback, or a different market basket.',
      detail: errorMessage
    };
  }

  if (/market mismatch/i.test(errorMessage)) {
    return {
      summary: 'This market basket does not match the selected data source.',
      nextStep: 'Choose a basket and data source from the same market.',
      detail: errorMessage
    };
  }

  return {
    summary: 'We could not create this snapshot with the current setup.',
    nextStep: 'Try again, or adjust the basket, date, or lookback.',
    detail: errorMessage
  };
}