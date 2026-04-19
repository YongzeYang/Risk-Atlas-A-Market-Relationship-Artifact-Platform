import { formatDateOnly } from './format';

type SnapshotScope = {
  universeId: string;
  asOfDate: string;
  windowDays: number;
};

export function formatLookbackLabel(windowDays: number): string {
  return `${windowDays}-day lookback`;
}

export function formatSnapshotScopeLabel(scope: SnapshotScope): string {
  return `${scope.universeId} · ${formatDateOnly(scope.asOfDate)} · ${formatLookbackLabel(scope.windowDays)}`;
}

export function formatSnapshotOptionLabel(scope: SnapshotScope & { id: string }): string {
  return `${formatSnapshotScopeLabel(scope)} · ${scope.id.slice(0, 8)}`;
}

export function describeBasketKind(kind: string): string {
  return kind === 'static' ? 'fixed basket' : 'rule-based basket';
}

export function describeCoverageCount(count: number | null | undefined): string {
  if (typeof count === 'number') {
    return `${count} names in scope`;
  }

  return 'resolved against the selected data source and date';
}