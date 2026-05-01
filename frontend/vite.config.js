import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      // Rule 1: Handle everything that starts with /api
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Rule 2: Explicitly list every other backend path
      // This ensures Vite ONLY proxies these specific names
      '^/(feed|friends|profile|pending-count|announcements|status|count|overrides|portfolio|dividends|login|auth|register|users|mod)': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    historyApiFallback: true,
  },
});