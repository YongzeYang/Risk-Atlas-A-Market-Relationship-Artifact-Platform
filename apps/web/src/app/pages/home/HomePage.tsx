// apps/web/src/app/pages/home/HomePage.tsx
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

      <div className="home-layout">
        <div className="home-layout__form">
          <BuildFormPanel
            datasets={datasets}
            universes={universes}
            loading={catalogLoading}
            error={catalogError}
            onBuildCreated={handleBuildCreated}
          />
        </div>

        <div className="home-layout__main">
          <BuildRunsPanel
            buildRuns={buildRuns}
            loading={buildRunsLoading}
            refreshing={buildRunsRefreshing}
            error={buildRunsError}
            lastCreatedBuildId={lastCreatedBuildId}
            onRefresh={refreshBuildRuns}
          />
        </div>

        <div className="home-layout__reference">
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