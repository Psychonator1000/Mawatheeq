import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const base = process.env.PAGES_BASE_PATH || '/Mawatheeq/';

// The built page may only talk to itself and the configured backend (the dev server needs inline scripts, so it goes without).
function contentSecurityPolicy(): Plugin {
  const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/app-config.json'), 'utf8')) as { supabaseUrl?: string };
  const api = config.supabaseUrl ? new URL(config.supabaseUrl).origin : '';
  const policy = [
    "default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: https: ${api}`.trim(), `connect-src 'self' blob: ${api} ${api.replace(/^https:/,'wss:')}`.trim(), `frame-src 'self' blob: ${api}`.trim(),
    "object-src 'none'", "base-uri 'self'", "form-action 'none'",
  ].join('; ');
  return { name: 'content-security-policy', apply: 'build', transformIndexHtml: html => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`) };
}

export default defineConfig({
  root: path.join(projectRoot, 'pages'),
  base,
  publicDir: path.join(projectRoot, 'public'),
  plugins: [react(), contentSecurityPolicy()],
  resolve: { alias: { '@': projectRoot } },
  define: {
    'process.env.NEXT_PUBLIC_DATA_BACKEND': JSON.stringify('supabase'),
    'process.env.NEXT_PUBLIC_BASE_PATH': JSON.stringify(base.replace(/\/$/, '')),
  },
  css: { postcss: path.join(projectRoot, 'postcss.config.mjs') },
  build: { outDir: path.join(projectRoot, 'dist-pages'), emptyOutDir: true },
});
