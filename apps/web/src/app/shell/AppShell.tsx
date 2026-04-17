// apps/web/src/app/shell/AppShell.tsx
import type { ReactNode } from 'react';

import Footer from './Footer';
import TopBar from './TopBar';

type AppShellProps = {
  children: ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <TopBar />
      <main className="page-shell">{children}</main>
      <Footer />
    </div>
  );
}