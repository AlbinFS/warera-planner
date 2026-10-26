import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: 'dist',
    // Hashed file names, so the host can cache them for a year.
    assetsDir: 'assets',
  },
  worker: {
    format: 'es',
  },
  server: {
    // In development, /api goes to the local Worker (`npx wrangler dev`).
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
