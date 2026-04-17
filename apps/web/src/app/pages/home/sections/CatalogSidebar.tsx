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
      <Panel>
        <SectionHeader
          title="Datasets"
          subtitle="Current local catalog available to the build form."
        />

        {loading ? <div className="state-note">Loading datasets…</div> : null}
        {error ? <div className="state-note state-note--error">{error}</div> : null}

        <div className="catalog-list">
          {datasets.map((dataset) => (
            <div key={dataset.id} className="catalog-item">
              <div className="catalog-item__head">
                <span className="catalog-item__title">{dataset.name}</span>
                <span className="catalog-item__code mono">{dataset.id}</span>
              </div>

              <dl className="catalog-metrics">
                <div>
                  <dt>Symbols</dt>
                  <dd>{formatInteger(dataset.symbolCount)}</dd>
                </div>
                <div>
                  <dt>Rows</dt>
                  <dd>{formatInteger(dataset.priceRowCount)}</dd>
                </div>
                <div>
                  <dt>Range</dt>
                  <dd className="mono">
                    {formatDateOnly(dataset.minTradeDate)} → {formatDateOnly(dataset.maxTradeDate)}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeader
          title="Universes"
          subtitle="Seeded subsets intended for the first demo flow."
        />

        {loading ? <div className="state-note">Loading universes…</div> : null}
        {error ? <div className="state-note state-note--error">{error}</div> : null}

        <div className="catalog-list">
          {universes.map((universe) => (
            <div key={universe.id} className="catalog-item">
              <div className="catalog-item__head">
                <span className="catalog-item__title">{universe.name}</span>
                <span className="catalog-item__code mono">{universe.id}</span>
              </div>

              <div className="catalog-item__meta">
                <span>{formatInteger(universe.symbolCount)} symbols</span>
              </div>

              <div className="catalog-symbol-preview">
                {universe.symbols.slice(0, 6).map((symbol) => (
                  <span key={symbol} className="catalog-symbol-preview__chip mono">
                    {symbol}
                  </span>
                ))}
                {universe.symbols.length > 6 ? (
                  <span className="catalog-symbol-preview__chip">
                    +{universe.symbols.length - 6}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}