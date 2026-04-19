import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const proxyPrefixes = [
  '/datasets',
  '/universes',
  '/security-master',
  '/build-runs',
  '/build-series',
  '/analysis-runs',
  '/compare-builds',
  '/compare-build-structures',
  '/docs',
  '/health'
] as const;

function normalizeTarget(rawValue: string | undefined): string {
  const trimmed = rawValue?.trim();
  if (!trimmed) {
    return 'http://localhost:3000';
  }

  return trimmed.replace(/\/+$/, '');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = normalizeTarget(env.VITE_API_BASE_URL);
  const webPort = Number(env.WEB_PORT || 5173);

  return {
    plugins: [react()],
    server: {
      port: Number.isFinite(webPort) ? webPort : 5173,
      proxy: Object.fromEntries(proxyPrefixes.map((prefix) => [prefix, proxyTarget]))
    }
  };
});