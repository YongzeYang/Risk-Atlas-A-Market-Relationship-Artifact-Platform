// apps/web/src/app/pages/build-detail/BuildDetailPage.tsx
import { useParams } from 'react-router-dom';

import Panel from '../../../components/ui/Panel';
import SectionHeader from '../../../components/ui/SectionHeader';
import StatCard from '../../../components/ui/StatCard';
import { useBuildDetailData } from '../../../features/builds/hooks';
import { formatDateTime, formatInteger, formatScore, formatScoreRange } from '../../../lib/format';
import BuildMetaHeader from './sections/BuildMetaHeader';
import HeatmapPanel from './sections/HeatmapPanel';
import NeighborsPanel from './sections/NeighborsPanel';
import PairLookupPanel from './sections/PairLookupPanel';
import TopPairsPanel from './sections/TopPairsPanel';

function buildStateCopy(status: 'pending' | 'running' | 'failed' | 'succeeded', errorMessage: string | null) {
  if (status === 'pending') {
    return {
      eyebrow: 'Build queued',
      title: 'This build has not started yet.',
      description: 'Keep this page open or refresh again in a moment.'
    };
  }

  if (status === 'running') {
    return {
      eyebrow: 'Build running',
      title: 'Results are being prepared.',
      description: 'Matrix and pair views will appear here when the bundle is ready.'
    };
  }

  if (status === 'failed') {
    return {
      eyebrow: 'Build failed',
      title: 'This build could not be completed.',
      description: errorMessage ?? 'Review the message above and try another build.'
    };
  }

  return {
    eyebrow: 'Preparing results',
    title: 'The bundle is still loading.',
    description: 'This page will update when the result bundle is ready.'
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
        <div className="state-note state-note--error">Missing build id in route.</div>
      </Panel>
    );
  }

  const ready =
    detail?.status === 'succeeded' &&
    detail.symbolOrder.length > 0 &&
    detail.artifact !== null;
  const pairCount = detail?.symbolOrder.length
    ? (detail.symbolOrder.length * (detail.symbolOrder.length - 1)) / 2
    : null;
  const strongestPair = detail?.topPairs[0] ?? null;

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
          <Panel variant="secondary">
            <SectionHeader
              title="Analysis workspace"
              subtitle="Separate matrix context, strongest pairs, and neighbor queries so this page reads like a research surface rather than a raw artifact dump."
            />

            <div className="analysis-overview-grid">
              <StatCard
                label="Resolved symbols"
                value={formatInteger(detail.symbolOrder.length)}
                helper="Actual build scope after universe rules are resolved."
                mono
              />
              <StatCard
                label="Unique pairs"
                value={pairCount !== null ? formatInteger(pairCount) : '—'}
                helper="Potential pair relationships inside this snapshot."
                mono
              />
              <StatCard
                label="Strongest pair"
                value={strongestPair ? `${strongestPair.left} ↔ ${strongestPair.right}` : '—'}
                helper={strongestPair ? `Score ${formatScore(strongestPair.score, 3)}` : 'No pair summary available.'}
              />
              <StatCard
                label="Score band"
                value={formatScoreRange(detail.minScore, detail.maxScore)}
                helper="Use together with the matrix subset stats below to judge concentration versus dispersion."
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
            </div>

            <div className="analysis-workspace__side">
              <Panel variant="utility">
                <SectionHeader
                  title="Research prompts"
                  subtitle="Use these tools as starting points for deeper pair divergence and exposure analysis."
                />

                <div className="workspace-note-list">
                  <div className="workspace-note-list__item">Start with the matrix when you want distribution context and subset structure.</div>
                  <div className="workspace-note-list__item">Use Pairs when you need the strongest relationships worth comparing across time or window choices.</div>
                  <div className="workspace-note-list__item">Use Co-movement exposure when the question starts from one anchor symbol rather than one anchor pair.</div>
                </div>
              </Panel>

              <PairLookupPanel
                buildRunId={id}
                symbols={detail.symbolOrder}
              />

              <NeighborsPanel
                buildRunId={id}
                symbols={detail.symbolOrder}
              />
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