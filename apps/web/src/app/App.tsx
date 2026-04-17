// apps/web/src/app/App.tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import BuildDetailPage from './pages/build-detail/BuildDetailPage';
import HomePage from './pages/home/HomePage';
import AppShell from './shell/AppShell';

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/builds/:id" element={<BuildDetailPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}