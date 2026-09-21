import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/sora';
import '@fontsource/instrument-serif/400.css';
import './styles/index.css';
import App from './App';
import { applyTheme, storedTheme } from './mobile/theme';

// Paint the theme before the first frame. Doing it inside React would show
// one frame of the wrong palette on every launch.
if (window.matchMedia('(max-width: 767px)').matches) {
  applyTheme(storedTheme());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Installed app / offline use. Only in a real build: in dev it would serve
// stale bundles.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.warn('[hence] offline support unavailable', error);
    });
  });
}
