// apps/web/src/components/ui/StatCard.tsx
type StatCardProps = {
  label: string;
  value: string;
  helper?: string;
  mono?: boolean;
};

export default function StatCard({ label, value, helper, mono = false }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card__label">{label}</div>
      <div className={`stat-card__value${mono ? ' mono' : ''}`}>{value}</div>
      {helper ? <div className="stat-card__helper">{helper}</div> : null}
    </div>
  );
}