import { useParams } from 'react-router-dom';

import Panel from '../../../components/ui/Panel';
import { useBuildDetailData } from '../../../features/builds/hooks';
import BuildMetaHeader from './sections/BuildMetaHeader';
import HeatmapPanel from './sections/HeatmapPanel';
import NeighborsPanel from './sections/NeighborsPanel';
import PairLookupPanel from './sections/PairLookupPanel';
import TopPairsPanel from './sections/TopPairsPanel';

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
      <Panel>
        <div className="state-note state-note--error">Missing build id in route.</div>
      </Panel>
    );
  }

  const interactive =
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

      <div className="detail-grid">
        <div className="detail-grid__main">
          <TopPairsPanel
            topPairs={detail?.topPairs ?? []}
            loading={loading}
            disabled={!interactive}
          />
        </div>

        <div className="detail-grid__side">
          <PairLookupPanel
            buildRunId={id}
            symbols={detail?.symbolOrder ?? []}
            disabled={!interactive}
          />
          <NeighborsPanel
            buildRunId={id}
            symbols={detail?.symbolOrder ?? []}
            disabled={!interactive}
          />
        </div>
      </div>

      <HeatmapPanel
        buildRunId={id}
        symbolOrder={detail?.symbolOrder ?? []}
        topPairs={detail?.topPairs ?? []}
        disabled={!interactive}
      />
    </div>
  );
}