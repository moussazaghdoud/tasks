import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/sora';
import '@fontsource/instrument-serif/400.css';
import './styles/index.css';
import App from './App';

// Decide the theme before the first paint: the phone runs Premium Dark, and
// setting this inside React would show one frame of the light loading screen.
if (window.matchMedia('(max-width: 767px)').matches) {
  document.documentElement.setAttribute('data-theme', 'dark');
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
