import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/sora';
import '@fontsource/instrument-serif/400.css';
// The looks' own type, bundled so it works offline and asks no font server.
import '@fontsource/caveat/600.css';
import '@fontsource/kalam/400.css';
import '@fontsource-variable/nunito';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/figtree';
import '@fontsource-variable/urbanist';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import './styles/index.css';
import './styles/looks.css';
import App from './App';
import { applyLook, currentLook } from './mobile/look';
import { applyTheme, storedTheme } from './mobile/theme';

// Paint the theme and the look before the first frame. Doing it inside React
// would show one frame of the wrong palette on every launch.
if (window.matchMedia('(max-width: 767px)').matches) {
  applyTheme(storedTheme());
  applyLook(currentLook());
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
