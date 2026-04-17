import { useCallback, useState } from 'react';

import { useBuildRunsData } from '../../../features/builds/hooks';
import { useCatalogData } from '../../../features/catalog/hooks';
import type { BuildRunListItem } from '../../../types/api';
import BuildFormPanel from './sections/BuildFormPanel';
import BuildRunsPanel from './sections/BuildRunsPanel';
import CatalogSidebar from './sections/CatalogSidebar';
import HomeIntroBand from './sections/HomeIntroBand';

export default function HomePage() {
  const { datasets, universes, loading: catalogLoading, error: catalogError } = useCatalogData();
  const {
    buildRuns,
    loading: buildRunsLoading,
    refreshing: buildRunsRefreshing,
    error: buildRunsError,
    refresh: refreshBuildRuns
  } = useBuildRunsData(3000);

  const [lastCreatedBuildId, setLastCreatedBuildId] = useState<string | null>(null);

  const handleBuildCreated = useCallback(
    (buildRun: BuildRunListItem) => {
      setLastCreatedBuildId(buildRun.id);
      void refreshBuildRuns();
    },
    [refreshBuildRuns]
  );

  return (
    <div className="page page--home">
      <HomeIntroBand />

      <div className="home-grid">
        <div className="home-grid__left">
          <BuildFormPanel
            datasets={datasets}
            universes={universes}
            loading={catalogLoading}
            error={catalogError}
            onBuildCreated={handleBuildCreated}
          />
        </div>

        <div className="home-grid__center">
          <BuildRunsPanel
            buildRuns={buildRuns}
            loading={buildRunsLoading}
            refreshing={buildRunsRefreshing}
            error={buildRunsError}
            lastCreatedBuildId={lastCreatedBuildId}
            onRefresh={refreshBuildRuns}
          />
        </div>

        <div className="home-grid__right">
          <CatalogSidebar
            datasets={datasets}
            universes={universes}
            loading={catalogLoading}
            error={catalogError}
          />
        </div>
      </div>
    </div>
  );
}