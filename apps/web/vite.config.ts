import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/datasets': 'http://localhost:3000',
      '/universes': 'http://localhost:3000',
      '/security-master': 'http://localhost:3000',
      '/build-runs': 'http://localhost:3000',
      '/build-series': 'http://localhost:3000',
      '/compare-builds': 'http://localhost:3000',
      '/docs': 'http://localhost:3000',
      '/health': 'http://localhost:3000'
    }
  }
});