type PrimaryNavItem = {
  to: string;
  label: string;
  end?: boolean;
};

export const primaryNavItems: PrimaryNavItem[] = [
  {
    to: '/',
    label: 'Home',
    end: true
  },
  {
    to: '/builds',
    label: 'Snapshots'
  },
  {
    to: '/series',
    label: 'Snapshot series'
  },
  {
    to: '/structure',
    label: 'Groups'
  },
  {
    to: '/compare',
    label: 'What changed'
  },
  {
    to: '/divergence',
    label: 'Relationships'
  },
  {
    to: '/exposure',
    label: 'Spillover'
  }
];