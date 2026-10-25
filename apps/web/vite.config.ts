import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = resolve(import.meta.dirname, '../..');

export default defineConfig(({ mode }) => {
  // Server-side only: read ports from the root .env. Nothing here is exposed to the browser bundle.
  const env = loadEnv(mode, repoRoot, '');
  const apiPort = Number(env.API_PORT || 4000);
  const webPort = Number(env.WEB_PORT || 5173);

  return {
    plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
    resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
    server: {
      host: '127.0.0.1',
      port: webPort,
      strictPort: true,
      proxy: {
        '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
        '/uploads': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false },
      },
    },
    preview: { host: '127.0.0.1', port: webPort, strictPort: true },
    build: {
      target: 'es2023',
      sourcemap: true,
      chunkSizeWarningLimit: 700,
    },
  };
});
