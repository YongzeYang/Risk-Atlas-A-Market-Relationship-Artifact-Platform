// apps/web/src/app/pages/build-detail/BuildDetailPage.tsx
import { Link, useParams } from 'react-router-dom';

import BoundaryNote from '../../../components/ui/BoundaryNote';
import Panel from '../../../components/ui/Panel';
import ResearchDetails from '../../../components/ui/ResearchDetails';
import SectionHeader from '../../../components/ui/SectionHeader';
import StatCard from '../../../components/ui/StatCard';
import WorkflowStrip from '../../../components/ui/WorkflowStrip';
import { useBuildDetailData } from '../../../features/builds/hooks';
import { formatDateTime, formatInteger, formatScore, formatScoreRange } from '../../../lib/format';
import { buildSnapshotWorkflowItems } from '../../../lib/analysis-workflow';
import { formatLookbackLabel } from '../../../lib/snapshot-language';
import BuildMetaHeader from './sections/BuildMetaHeader';
import HeatmapPanel from './sections/HeatmapPanel';
import NeighborsPanel from './sections/NeighborsPanel';
import PairLookupPanel from './sections/PairLookupPanel';
import TopPairsPanel from './sections/TopPairsPanel';

function buildStateCopy(status: 'pending' | 'running' | 'failed' | 'succeeded', errorMessage: string | null) {
  if (status === 'pending') {
    return {
      eyebrow: 'Preparing',
      title: 'This snapshot has not started yet.',
      description: 'Keep this page open or refresh again in a moment.'
    };
  }

  if (status === 'running') {
    return {
      eyebrow: 'Snapshot running',
      title: 'This market read is still being prepared.',
      description: 'The diversification, relationship, and spillover sections will appear here when the snapshot is ready.'
    };
  }

  if (status === 'failed') {
    return {
      eyebrow: 'Snapshot failed',
      title: 'This snapshot could not be completed.',
      description: errorMessage ?? 'Review the message above and try another snapshot.'
    };
  }

  return {
    eyebrow: 'Preparing results',
    title: 'The result bundle is still loading.',
    description: 'This page will update when the snapshot data is ready.'
  };
}

export default function BuildDetailPage() {
  const { id } = useParams<{ id: string }>();

  const {
    detail,
    loading,
    refreshing,
    error,
    refresh
  } = useBuildDetailData(id, 2000);

  if (!id) {
    return (
      <Panel variant="utility">
        <div className="state-note state-note--error">Missing snapshot id in route.</div>
      </Panel>
    );
  }

  const ready =
    detail?.status === 'succeeded' &&
    detail.symbolOrder.length > 0 &&
    detail.artifact !== null;
  const strongestPair = detail?.topPairs[0] ?? null;
  const workflowItems = buildSnapshotWorkflowItems('snapshot', {
    snapshotTo: `/builds/${id}`,
    groupsTo: `/structure?build=${id}`,
    compareTo: `/compare?left=${id}`,
    relationshipsTo: `/divergence?build=${id}`,
    spilloverTo: `/exposure?build=${id}`
  });

  return (
    <div className="page page--detail">
      <BuildMetaHeader
        detail={detail}
        loading={loading}
        error={error}
        refreshing={refreshing}
        onRefresh={refresh}
      />

      {ready ? (
        <>
          <BoundaryNote variant="accent">
            A snapshot shows how names moved together over the selected lookback. It does not explain why they moved,
            whether the pattern will persist, or what to trade next.
          </BoundaryNote>

          <WorkflowStrip
            title="Move from the base read into the next question"
            subtitle="Stay with one snapshot until the question truly changes. Then move one step narrower."
            items={workflowItems}
            className="analysis-flow-strip"
            compact
          />

          <Panel variant="secondary">
            <SectionHeader
              title="Read the basket before you explain it"
              subtitle="Start from concentration and overlap, then move toward pairs, one-name spillover, hidden groups, and only then cross-snapshot comparison."
            />

            <div className="analysis-overview-grid">
              <StatCard
                label="Diversification read"
                value={
                  detail.minScore != null && detail.maxScore != null && detail.minScore >= 0
                    ? 'Moderate concentration'
                    : detail.minScore != null && detail.maxScore != null && detail.maxScore > 0.5
                      ? 'Some overlap present'
                      : 'Wide spread'
                }
                helper="A quick take on how concentrated the basket looks overall."
              />
              <StatCard
                label="Strongest relationship"
                value={strongestPair ? `${strongestPair.left} ↔ ${strongestPair.right}` : '—'}
                helper={strongestPair ? `Score ${formatScore(strongestPair.score, 3)}` : 'No relationship summary available.'}
              />
              <StatCard
                label="Names in basket"
                value={formatInteger(detail.symbolOrder.length)}
                helper="Actual scope after the basket rules are resolved at this date."
                mono
              />
              <StatCard
                label="Relationship range"
                value={formatScoreRange(detail.minScore, detail.maxScore)}
                helper="The full range of pairwise scores inside this basket."
                mono
              />
            </div>
          </Panel>

          <div className="analysis-workspace">
            <div className="analysis-workspace__main">
              <HeatmapPanel
                buildRunId={id}
                symbolOrder={detail.symbolOrder}
                topPairs={detail.topPairs}
              />

              <TopPairsPanel topPairs={detail.topPairs} symbolCount={detail.symbolOrder.length} />

              <NeighborsPanel
                buildRunId={id}
                symbols={detail.symbolOrder}
              />

              <Panel variant="utility">
                <SectionHeader
                  title="4. What hidden groups exist in this basket?"
                  subtitle="Use Groups when you want the basket reordered into clearer hidden blocs."
                  action={
                    <Link to={`/structure?build=${id}`} className="button button--secondary button--sm">
                      Open groups
                    </Link>
                  }
                />

                <div className="workspace-note-list">
                  <div className="workspace-note-list__item">This basket already hints at tighter pockets of names. Groups reorders them into clearer clusters.</div>
                  <div className="workspace-note-list__item">That screen adds ordered heatmaps, dominant-sector summaries, and cluster-drift comparison.</div>
                </div>
              </Panel>

              <Panel variant="utility">
                <SectionHeader
                  title="5. What changed?"
                  subtitle="Use comparison when the real question is not this snapshot by itself, but how the structure changed."
                  action={
                    <Link to={`/compare?left=${id}`} className="button button--secondary button--sm">
                      Compare snapshot
                    </Link>
                  }
                />

                <div className="workspace-note-list">
                  <div className="workspace-note-list__item">Compare this snapshot to another date when your question is time change.</div>
                  <div className="workspace-note-list__item">Compare this snapshot to a different lookback when you want to test stability versus recency.</div>
                  <div className="workspace-note-list__item">Compare this snapshot to another basket when you want to see where the overlap truly differs.</div>
                </div>
              </Panel>
            </div>

            <div className="analysis-workspace__side">
              <Panel variant="utility">
                <SectionHeader
                  title="Question-led next steps"
                  subtitle="This page is the broad read. Use the linked screens only when the question becomes narrower or explicitly changes."
                />

                <div className="workspace-note-list">
                  <div className="workspace-note-list__item">Start with the diversification check when the question is whether the basket is really spreading risk.</div>
                  <div className="workspace-note-list__item">Move to Relationships when one pair looks unusually strong or newly different.</div>
                  <div className="workspace-note-list__item">Move to Spillover when the question starts from one anchor name rather than one anchor pair.</div>
                </div>
              </Panel>

              <PairLookupPanel
                buildRunId={id}
                symbols={detail.symbolOrder}
              />

              <ResearchDetails summary="Advanced snapshot details">
                <div className="workspace-note-list">
                  <div className="workspace-note-list__item">Snapshot date: {detail.asOfDate}</div>
                  <div className="workspace-note-list__item">Lookback: {formatLookbackLabel(detail.windowDays)}</div>
                  <div className="workspace-note-list__item">Created: {formatDateTime(detail.createdAt)}</div>
                  <div className="workspace-note-list__item">Data source: {detail.datasetId}</div>
                  <div className="workspace-note-list__item">Basket code: {detail.universeId}</div>
                </div>
              </ResearchDetails>
            </div>
          </div>
        </>
      ) : detail ? (
        <Panel variant="secondary" className="build-state">
          <div className="build-state__eyebrow">
            {buildStateCopy(detail.status, detail.errorMessage).eyebrow}
          </div>

          <h2 className="build-state__title">
            {buildStateCopy(detail.status, detail.errorMessage).title}
          </h2>

          <p className="build-state__description">
            {buildStateCopy(detail.status, detail.errorMessage).description}
          </p>

          <div className="build-state__meta">
            <span className="mono">{detail.universeId}</span>
            <span>·</span>
            <span className="mono">{formatDateTime(detail.createdAt)}</span>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}