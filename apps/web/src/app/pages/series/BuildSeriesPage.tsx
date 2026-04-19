// apps/web/src/app/pages/series/BuildSeriesPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import BoundaryNote from '../../../components/ui/BoundaryNote';
import Panel from '../../../components/ui/Panel';
import ResearchDetails from '../../../components/ui/ResearchDetails';
import SectionHeader from '../../../components/ui/SectionHeader';
import StatusBadge from '../../../components/ui/StatusBadge';
import { createBuildSeries } from '../../../features/builds/api';
import {
  useBuildRequestValidation,
  useBuildSeriesData,
  useInviteCode
} from '../../../features/builds/hooks';
import { useCatalogData } from '../../../features/catalog/hooks';
import { getEarliestBuildableAsOfDate } from '../../../lib/build-dates';
import { formatDateOnly, formatDateTime } from '../../../lib/format';
import {
  describeBasketKind,
  describeCoverageCount,
  formatLookbackLabel
} from '../../../lib/snapshot-language';
import type {
  BuildRunScoreMethod,
  BuildRunWindowDays,
  BuildSeriesFrequency,
  BuildSeriesListItem,
  CreateBuildSeriesInput
} from '../../../types/api';

const WINDOW_OPTIONS: BuildRunWindowDays[] = [60, 120, 252];
const FREQUENCY_OPTIONS: BuildSeriesFrequency[] = ['daily', 'weekly', 'monthly'];
const SCORE_METHOD: BuildRunScoreMethod = 'pearson_corr';

export default function BuildSeriesPage() {
  const {
    datasets,
    universes,
    datasetsLoading,
    universesLoading
  } = useCatalogData();
  const { series, loading: seriesLoading, refresh } = useBuildSeriesData();

  const [datasetId, setDatasetId] = useState('');
  const [universeId, setUniverseId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [windowDays, setWindowDays] = useState<BuildRunWindowDays>(252);
  const [frequency, setFrequency] = useState<BuildSeriesFrequency>('weekly');
  const [seriesName, setSeriesName] = useState('');
  const { inviteCode, setInviteCode } = useInviteCode();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const previousDatasetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!datasetId && datasets.length > 0) setDatasetId(datasets[0].id);
  }, [datasetId, datasets]);

  const selectedDataset = useMemo(
    () => datasets.find((d) => d.id === datasetId) ?? null,
    [datasetId, datasets]
  );
  const selectedUniverse = useMemo(
    () => universes.find((universe) => universe.id === universeId) ?? null,
    [universeId, universes]
  );
  const minStartDate = useMemo(
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
    validation: startValidation,
    validating: startValidationLoading,
    error: startValidationError
  } = useBuildRequestValidation({
    datasetId,
    universeId,
    asOfDate: startDate,
    windowDays,
    enabled: Boolean(datasetId && universeId && startDate && compatibleUniverses.length > 0)
  });
  const activeSeries = useMemo(
    () => series.filter((item) => item.status === 'pending' || item.status === 'running'),
    [series]
  );
  const completedSeries = useMemo(
    () => series.filter((item) => item.status === 'succeeded'),
    [series]
  );
  const failedSeries = useMemo(
    () => series.filter((item) => item.status === 'failed' || item.status === 'partially_failed'),
    [series]
  );

  useEffect(() => {
    const currentDatasetId = selectedDataset?.id ?? null;
    const datasetChanged = previousDatasetIdRef.current !== currentDatasetId;
    previousDatasetIdRef.current = currentDatasetId;

    if (!selectedDataset) {
      setStartDate('');
      setEndDate('');
      return;
    }

    if (datasetChanged) {
      setStartDate(minStartDate ?? '');
      setEndDate(selectedDataset.maxTradeDate ?? '');
    }
  }, [minStartDate, selectedDataset?.id, selectedDataset?.maxTradeDate]);

  useEffect(() => {
    const maxTradeDate = selectedDataset?.maxTradeDate;
    if (!maxTradeDate) {
      return;
    }

    if (!minStartDate) {
      setStartDate('');
      return;
    }

    setStartDate((current) => {
      if (!current) {
        return minStartDate;
      }

      if (current < minStartDate) {
        return minStartDate;
      }

      if (current > maxTradeDate) {
        return maxTradeDate;
      }

      return current;
    });
    setEndDate((current) => {
      if (!current) {
        return maxTradeDate;
      }

      if (current > maxTradeDate) {
        return maxTradeDate;
      }

      return current;
    });
  }, [minStartDate, selectedDataset?.maxTradeDate]);

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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      setSubmitError(null);

      const payload: CreateBuildSeriesInput = {
        name: seriesName || `Series ${new Date().toISOString().slice(0, 10)}`,
        datasetId,
        universeId,
        windowDays,
        scoreMethod: SCORE_METHOD,
        startDate,
        endDate,
        frequency,
        inviteCode
      };

      try {
        await createBuildSeries(payload);
        refresh();
        setSeriesName('');
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to create snapshot series.');
      } finally {
        setSubmitting(false);
      }
    },
    [seriesName, datasetId, universeId, windowDays, startDate, endDate, frequency, inviteCode, refresh]
  );
  const dateRangeError = useMemo(() => {
    if (!startDate || !endDate) {
      return null;
    }

    if (startDate >= endDate) {
      return 'Start date must be earlier than end date.';
    }

    if (minStartDate && startDate < minStartDate) {
      return `Start date is earlier than the earliest buildable ${formatLookbackLabel(windowDays)} date (${minStartDate}).`;
    }

    if (selectedDataset?.maxTradeDate && endDate > selectedDataset.maxTradeDate) {
      return `End date is later than the dataset range (${selectedDataset.maxTradeDate}).`;
    }

    return null;
  }, [endDate, minStartDate, selectedDataset?.maxTradeDate, startDate, windowDays]);

  return (
    <div className="page page--series">
      <section className="workspace-hero">
        <div className="workspace-hero__copy">
          <div className="workspace-hero__eyebrow">Snapshot series</div>
          <h1 className="workspace-hero__title">Watch one basket through time.</h1>
          <p className="workspace-hero__description">
            A snapshot series is for repeated reads of the same setup across time. Use it when the question is not one day,
            but the path of the basket across many dates.
          </p>
        </div>

        <div className="workspace-hero__stats">
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{series.length}</div>
            <div className="workspace-hero__stat-label">Total series</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{activeSeries.length}</div>
            <div className="workspace-hero__stat-label">Running now</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{completedSeries.length}</div>
            <div className="workspace-hero__stat-label">Completed</div>
          </article>
          <article className="workspace-hero__stat-card">
            <div className="workspace-hero__stat-value mono">{failedSeries.length}</div>
            <div className="workspace-hero__stat-label">With failures</div>
          </article>
        </div>
      </section>

      <div className="workspace-layout">
        <div className="workspace-layout__main">
          <Panel variant="primary">
            <SectionHeader
              title="Active snapshot series"
              subtitle="Use this area to monitor repeated snapshot programs still in flight."
            />

            {!seriesLoading && activeSeries.length === 0 ? (
              <div className="state-note">No active series right now. Create one from the side rail.</div>
            ) : null}

            {activeSeries.length > 0 ? (
              <div className="build-stream">
                {activeSeries.map((s) => (
                  <SeriesRow key={s.id} item={s} />
                ))}
              </div>
            ) : null}
          </Panel>

          <Panel variant="primary">
            <SectionHeader
              title="All snapshot series"
              subtitle="Completed, failed, and active programs in one rolling ledger."
            />

            {seriesLoading ? <div className="state-note">Loading…</div> : null}

            {!seriesLoading && series.length === 0 ? (
              <div className="state-note">No snapshot series yet.</div>
            ) : null}

            {series.length > 0 ? (
              <div className="build-stream">
                {series.map((s) => (
                  <SeriesRow key={s.id} item={s} />
                ))}
              </div>
            ) : null}
          </Panel>
        </div>

        <div className="workspace-layout__side">
          <Panel variant="primary">
            <SectionHeader
              title="Create snapshot series"
              subtitle="Define a repeated snapshot program with an explicit date range, lookback, and cadence."
            />

            <BoundaryNote title="What this does" variant="accent">
              This creates many snapshots from the same basket setup across time. It is useful for drift tracking,
              regime checks, and monitoring whether hidden groups stay stable.
            </BoundaryNote>

            <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span className="field__label">Series name</span>
              <input
                className="field__control"
                type="text"
                placeholder="Optional label"
                value={seriesName}
                onChange={(e) => setSeriesName(e.target.value)}
                disabled={submitting}
              />
            </label>

            <div className="form-grid__inline">
              <label className="field">
                <span className="field__label">Data source</span>
                <select
                  className="field__control mono"
                  value={datasetId}
                  onChange={(e) => setDatasetId(e.target.value)}
                  disabled={datasetsLoading || submitting || datasets.length === 0}
                >
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <span className="field__hint">
                  {datasetsLoading && datasets.length === 0
                    ? 'Loading data sources…'
                    : selectedDataset
                      ? `${selectedDataset.name} · ${formatDateOnly(selectedDataset.minTradeDate)} → ${formatDateOnly(selectedDataset.maxTradeDate)}` +
                        (minStartDate
                          ? ` · earliest ${formatLookbackLabel(windowDays)} first run ${formatDateOnly(minStartDate)}`
                          : '')
                      : 'Select one data source.'}
                </span>
              </label>

              <label className="field">
                <span className="field__label">Basket</span>
                <select
                  className="field__control mono"
                  value={universeId}
                  onChange={(e) => setUniverseId(e.target.value)}
                  disabled={universesLoading || submitting || compatibleUniverses.length === 0}
                >
                  {compatibleUniverses.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <span className="field__hint">
                  {universesLoading && universes.length === 0
                    ? 'Loading baskets…'
                    : (() => {
                        if (!selectedUniverse) {
                          return 'Select one basket.';
                        }

                        const kind = describeBasketKind(selectedUniverse.definitionKind);

                        if (startValidation?.valid && startValidation.resolvedSymbolCount != null) {
                          return `${selectedUniverse.name} · ${kind} · ${startValidation.resolvedSymbolCount} names ready at the first scheduled run`;
                        }

                        return `${selectedUniverse.name} · ${kind} · ${describeCoverageCount(selectedUniverse.symbolCount)}`;
                      })()}
                </span>
              </label>
            </div>

            {!universesLoading && compatibleUniverses.length === 0 ? (
              <div className="state-note state-note--error">
                No compatible baskets are available for data source "{selectedDataset?.id ?? datasetId}".
              </div>
            ) : null}

            {dateRangeError ? (
              <div className="state-note state-note--error">{dateRangeError}</div>
            ) : null}

            {startValidationLoading ? (
              <div className="state-note">Checking the first scheduled build for matrix-ready coverage and size…</div>
            ) : null}

            {!startValidationLoading && startValidationError ? (
              <div className="state-note state-note--error">{startValidationError}</div>
            ) : null}

            {!startValidationLoading && startValidation && !startValidation.valid && startValidation.message ? (
              <div className="state-note state-note--error">{startValidation.message}</div>
            ) : null}

            {!startValidationLoading && startValidation?.valid && startValidation.resolvedSymbolCount != null ? (
              <div className="state-note">
                First scheduled run resolves to {startValidation.resolvedSymbolCount} usable names after row, alignment, and flat-series filtering.
              </div>
            ) : null}

            <div className="form-grid__inline">
              <label className="field">
                <span className="field__label">First snapshot date</span>
                <input
                  className="field__control mono"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  min={minStartDate ?? selectedDataset?.minTradeDate ?? undefined}
                  max={selectedDataset?.maxTradeDate ?? undefined}
                  disabled={submitting}
                />
              </label>

              <label className="field">
                <span className="field__label">Last snapshot date</span>
                <input
                  className="field__control mono"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={(startDate || minStartDate || selectedDataset?.minTradeDate) ?? undefined}
                  max={selectedDataset?.maxTradeDate ?? undefined}
                  disabled={submitting}
                />
              </label>
            </div>

            <div className="field__hint">
              The first scheduled run must already be buildable. The server snaps cadence to real trading dates, validates every scheduled run when you submit, and the earliest allowed start date still moves with the selected lookback.
            </div>

            <div className="form-grid__inline">
              <label className="field">
                <span className="field__label">Lookback</span>
                <select
                  className="field__control mono"
                  value={windowDays}
                  onChange={(e) => setWindowDays(Number(e.target.value) as BuildRunWindowDays)}
                  disabled={submitting}
                >
                  {WINDOW_OPTIONS.map((d) => (
                    <option key={d} value={d}>{formatLookbackLabel(d)}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field__label">Cadence</span>
                <select
                  className="field__control mono"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as BuildSeriesFrequency)}
                  disabled={submitting}
                >
                  {FREQUENCY_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span className="field__label">Invite code</span>
              <input
                className="field__control mono"
                type="text"
                placeholder="Enter invite code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                disabled={submitting}
                autoComplete="off"
              />
              <span className="field__hint">Required for create actions. Saved in this browser for convenience.</span>
            </label>

            {submitError ? <div className="state-note state-note--error">{submitError}</div> : null}

            <ResearchDetails summary="Research details">
              <div className="workspace-note-list">
                <div className="workspace-note-list__item">Weekly and monthly cadence snap to the last real trading date in each bucket.</div>
                <div className="workspace-note-list__item">Every scheduled snapshot is validated before the series is accepted.</div>
                <div className="workspace-note-list__item">A snapshot series is descriptive. It helps you watch drift and hidden groups over time, not bypass judgment.</div>
              </div>
            </ResearchDetails>

            <div className="form-actions">
              <button
                type="submit"
                className="button button--primary"
                disabled={
                  submitting ||
                  !datasetId ||
                  !universeId ||
                  !startDate ||
                  !endDate ||
                  !inviteCode ||
                  compatibleUniverses.length === 0 ||
                  Boolean(dateRangeError) ||
                  startValidationLoading ||
                  !startValidation?.valid
                }
              >
                {submitting ? 'Creating…' : 'Create snapshot series'}
              </button>
            </div>
            </form>
          </Panel>

          <Panel variant="utility">
            <SectionHeader
              title="How to use it"
              subtitle="Choose cadence based on the type of change you are trying to detect."
            />

            <div className="workspace-note-list">
              <div className="workspace-note-list__item">Daily series are useful when short-lived drift matters.</div>
              <div className="workspace-note-list__item">Weekly and monthly cadence are better when you want a cleaner long-horizon read.</div>
              <div className="workspace-note-list__item">Rule-based baskets make rolling runs more realistic because the resolved scope can change with market rules and liquidity.</div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function SeriesRow({ item }: { item: BuildSeriesListItem }) {
  const progress =
    item.totalRunCount > 0
      ? Math.round(((item.completedRunCount + item.failedRunCount) / item.totalRunCount) * 100)
      : 0;

  return (
    <Link to={`/series/${item.id}`} className="build-stream__item build-stream__item--link" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="build-stream__main">
        <div className="build-stream__topline">
          <StatusBadge status={item.status} />
          <span className="build-stream__scope">
            <strong>{item.name || item.id}</strong>
            <span className="build-stream__divider">·</span>
            <span className="mono">{item.frequency}</span>
          </span>
        </div>

        <div className="build-stream__meta">
          <span>
            <span className="build-stream__meta-label">Range</span>
            <span className="mono">
              {formatDateOnly(item.startDate)} → {formatDateOnly(item.endDate)}
            </span>
          </span>
          <span>
            <span className="build-stream__meta-label">Progress</span>
            <span className="mono">
              {item.completedRunCount}/{item.totalRunCount} snapshots ({progress}%)
            </span>
          </span>
          {item.failedRunCount > 0 ? (
            <span>
              <span className="build-stream__meta-label">Failed</span>
              <span className="mono">{item.failedRunCount}</span>
            </span>
          ) : null}
          <span>
            <span className="build-stream__meta-label">Created</span>
            <span className="mono">{formatDateTime(item.createdAt)}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
