import '@/lib/polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import '@fontsource-variable/noto-sans-arabic';
import '@/components/fonts.css';
import '../app/globals.css';
import './pages.css';
import '@/components/compact.css';
import SharedApp from './shared-app';
import { applyAppearance, loadAppearance, onThemeChange } from '@/lib/appearance';
import { syncThemeStyles } from '@/components/theme-styles';
import ErrorBoundary, { reloadForUpdate } from '@/components/error-boundary';

// Apply saved theme and motion choices before the first paint.
onThemeChange(syncThemeStyles);
applyAppearance(loadAppearance());
// After a new version is published, a page that was already open cannot load parts it has not used yet; reload it.
window.addEventListener('vite:preloadError', event => { if (reloadForUpdate()) event.preventDefault(); });

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" forcedTheme="light">
      <ErrorBoundary><SharedApp /></ErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>,
);
