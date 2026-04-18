// apps/web/src/app/App.tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import BuildDetailPage from './pages/build-detail/BuildDetailPage';
import BuildsPage from './pages/builds/BuildsPage';
import NewBuildPage from './pages/builds/NewBuildPage';
import ComparePage from './pages/compare/ComparePage';
import PairDivergencePage from './pages/divergence/PairDivergencePage';
import HomePage from './pages/home/HomePage';
import BuildSeriesPage from './pages/series/BuildSeriesPage';
import BuildSeriesDetailPage from './pages/series-detail/BuildSeriesDetailPage';
import AppShell from './shell/AppShell';

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/builds" element={<BuildsPage />} />
          <Route path="/builds/new" element={<NewBuildPage />} />
          <Route path="/builds/:id" element={<BuildDetailPage />} />
          <Route path="/series" element={<BuildSeriesPage />} />
          <Route path="/series/:id" element={<BuildSeriesDetailPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/divergence" element={<PairDivergencePage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}