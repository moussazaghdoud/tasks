import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { voiceMiddleware } from './server/voice.ts';

/**
 * Serves POST /api/voice from the dev and preview servers. The Claude
 * credentials stay in this Node process and never reach the browser.
 */
function voiceApi(): Plugin {
  return {
    name: 'hence-voice-api',
    configureServer(server) {
      server.middlewares.use('/api/voice', (req, res) => void voiceMiddleware(req, res));
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/voice', (req, res) => void voiceMiddleware(req, res));
    },
  };
}

export default defineConfig(({ mode }) => {
  // Make ANTHROPIC_API_KEY from .env / .env.local available to the server code
  // (without exposing it to the client bundle, which only sees VITE_* vars).
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [react(), tailwindcss(), voiceApi()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      // One app bundle (~170 kB gzipped incl. React) is fine for a V1; split when routes grow.
      chunkSizeWarningLimit: 700,
    },
    test: {
      environment: 'node',
    },
  };
});
