import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/datasets': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/universes': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/build-runs': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/docs': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});