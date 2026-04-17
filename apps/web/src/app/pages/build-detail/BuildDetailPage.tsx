// apps/web/src/app/pages/build-detail/BuildDetailPage.tsx
import { useParams } from 'react-router-dom';

import Panel from '../../../components/ui/Panel';
import { useBuildDetailData } from '../../../features/builds/hooks';
import { formatDateTime } from '../../../lib/format';
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
          <HeatmapPanel
            buildRunId={id}
            symbolOrder={detail.symbolOrder}
            topPairs={detail.topPairs}
          />

          <div className="detail-grid">
            <div className="detail-grid__main">
              <TopPairsPanel topPairs={detail.topPairs} />
            </div>

            <div className="detail-grid__side">
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