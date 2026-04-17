import type { ReactNode } from 'react';

import BannerStrip from './BannerStrip';
import Footer from './Footer';
import TopBar from './TopBar';

type AppShellProps = {
  children: ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <TopBar />
      <BannerStrip />
      <main className="page-shell">{children}</main>
      <Footer />
    </div>
  );
}