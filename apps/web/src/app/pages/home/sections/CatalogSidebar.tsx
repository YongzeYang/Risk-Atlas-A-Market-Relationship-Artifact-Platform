// apps/web/src/app/pages/home/sections/CatalogSidebar.tsx
import Panel from '../../../../components/ui/Panel';
import SectionHeader from '../../../../components/ui/SectionHeader';
import { formatDateOnly, formatInteger } from '../../../../lib/format';
import type { DatasetListItem, UniverseListItem } from '../../../../types/api';

type CatalogSidebarProps = {
  datasets: DatasetListItem[];
  universes: UniverseListItem[];
  loading: boolean;
  error: string | null;
};

export default function CatalogSidebar({
  datasets,
  universes,
  loading,
  error
}: CatalogSidebarProps) {
  return (
    <div className="catalog-stack">
      <Panel variant="utility" className="catalog-panel">
        <SectionHeader
          title="Available data"
          subtitle="Saved datasets for this workspace."
        />

        {loading ? <div className="state-note">Loading datasets…</div> : null}
        {error ? <div className="state-note state-note--error">{error}</div> : null}

        {!loading && datasets.length === 0 ? (
          <div className="state-note">No datasets available.</div>
        ) : null}

        <div className="catalog-list">
          {datasets.map((dataset) => (
            <article key={dataset.id} className="catalog-item">
              <div className="catalog-item__head">
                <span className="catalog-item__title">{dataset.name}</span>
                <span className="catalog-item__code mono">{dataset.id}</span>
              </div>

              <div className="catalog-item__meta-row">
                <span>{formatInteger(dataset.symbolCount)} symbols</span>
                <span>{formatInteger(dataset.priceRowCount)} rows</span>
              </div>

              <div className="catalog-item__range mono">
                {formatDateOnly(dataset.minTradeDate)} → {formatDateOnly(dataset.maxTradeDate)}
              </div>
            </article>
          ))}
        </div>
      </Panel>

      <Panel variant="utility" className="catalog-panel">
        <SectionHeader
          title="Saved universes"
          subtitle="Seeded symbol groups."
        />

        {loading ? <div className="state-note">Loading universes…</div> : null}
        {error ? <div className="state-note state-note--error">{error}</div> : null}

        {!loading && universes.length === 0 ? (
          <div className="state-note">No universes available.</div>
        ) : null}

        <div className="catalog-list">
          {universes.map((universe) => (
            <article key={universe.id} className="catalog-item">
              <div className="catalog-item__head">
                <span className="catalog-item__title">{universe.name}</span>
                <span className="catalog-item__code mono">{universe.id}</span>
              </div>

              <div className="catalog-item__meta-row">
                <span>{formatInteger(universe.symbolCount)} symbols</span>
              </div>

              <div className="catalog-symbol-preview">
                {universe.symbols.slice(0, 6).map((symbol) => (
                  <span key={symbol} className="catalog-symbol-preview__token mono">
                    {symbol}
                  </span>
                ))}

                {universe.symbols.length > 6 ? (
                  <span className="catalog-symbol-preview__token">
                    +{universe.symbols.length - 6}
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}