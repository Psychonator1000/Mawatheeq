import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const base = process.env.PAGES_BASE_PATH || '/Mawatheeq/';

export default defineConfig({
  root: path.join(projectRoot, 'pages'),
  base,
  publicDir: path.join(projectRoot, 'public'),
  plugins: [react()],
  resolve: { alias: { '@': projectRoot } },
  define: {
    'process.env.NEXT_PUBLIC_DATA_BACKEND': JSON.stringify('supabase'),
    'process.env.NEXT_PUBLIC_BASE_PATH': JSON.stringify(base.replace(/\/$/, '')),
  },
  css: { postcss: path.join(projectRoot, 'postcss.config.mjs') },
  build: { outDir: path.join(projectRoot, 'dist-pages'), emptyOutDir: true },
});
