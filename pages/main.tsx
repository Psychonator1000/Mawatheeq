import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import '@fontsource-variable/noto-sans-arabic';
import '../app/globals.css';
import './pages.css';
import SharedApp from './shared-app';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" forcedTheme="light">
      <SharedApp />
    </ThemeProvider>
  </React.StrictMode>,
);
