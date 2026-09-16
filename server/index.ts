/**
 * Production server (Railway, Render, Fly, a VPS…).
 *
 * Serves the built app from `dist/` and the voice analysis route, so the
 * Claude credentials stay on the server. In development this file isn't used:
 * the Vite dev server mounts the same route (see vite.config.ts).
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { voiceMiddleware } from './voice.ts';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const ROOT = resolve(process.cwd(), 'dist');
const INDEX = join(ROOT, 'index.html');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.webmanifest']);

/**
 * The analysis route spends real money, and a public URL is a public URL.
 * A small per-IP hourly budget keeps a stray visitor (or a crawler) from
 * running up the bill. Tune with VOICE_RATE_LIMIT, or 0 to disable.
 */
const LIMIT = Number(process.env.VOICE_RATE_LIMIT ?? 60);
const WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, { count: number; reset: number }>();

function overBudget(key: string): boolean {
  if (LIMIT <= 0) return false;
  const now = Date.now();
  const hit = hits.get(key);
  if (!hit || hit.reset < now) {
    hits.set(key, { count: 1, reset: now + WINDOW_MS });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return false;
  }
  hit.count++;
  return hit.count > LIMIT;
}

const clientIp = (req: IncomingMessage) =>
  (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

function securityHeaders(res: ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
}

async function sendFile(req: IncomingMessage, res: ServerResponse, path: string, status = 200) {
  const ext = extname(path);
  const info = await stat(path);
  res.statusCode = status;
  res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
  // Hashed asset names never change; the entry HTML must always be revalidated.
  res.setHeader('Cache-Control', path.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.setHeader('Last-Modified', info.mtime.toUTCString());

  const gzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] as string ?? '') && info.size > 1024;
  if (gzip) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
  } else {
    res.setHeader('Content-Length', String(info.size));
  }
  if (req.method === 'HEAD') return res.end();
  await pipeline(createReadStream(path), ...(gzip ? [createGzip()] : []), res);
}

/** Resolve a URL to a file inside dist, refusing anything that escapes it. */
function safePath(urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = resolve(join(ROOT, normalize(decoded)));
  return candidate === ROOT || candidate.startsWith(ROOT + sep) ? candidate : null;
}

const server = createServer((req, res) => {
  void (async () => {
    const url = req.url ?? '/';
    securityHeaders(res);

    if (url === '/healthz') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: true, voice: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) }));
    }

    if (url.startsWith('/api/voice')) {
      if (overBudget(clientIp(req))) {
        res.statusCode = 200; // the app treats this as "fall back to on-device"
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ ok: false, error: 'rate_limited', message: 'Hourly limit reached for this address.' }));
      }
      return voiceMiddleware(req, res);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      return res.end('Method not allowed');
    }

    const path = safePath(url === '/' ? '/index.html' : url);
    if (!path) {
      res.statusCode = 403;
      return res.end('Forbidden');
    }
    try {
      const info = await stat(path);
      if (info.isDirectory()) throw new Error('directory');
      await sendFile(req, res, path);
    } catch {
      // Unknown path with no extension: let the single-page app route it.
      if (!extname(path)) return sendFile(req, res, INDEX);
      res.statusCode = 404;
      res.end('Not found');
    }
  })().catch((error: unknown) => {
    console.error('[hence] request failed', error);
    if (!res.headersSent) res.statusCode = 500;
    res.end('Server error');
  });
});

server.listen(PORT, HOST, () => {
  const voice = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? 'Claude analysis enabled' : 'no ANTHROPIC_API_KEY — voice memos use on-device analysis';
  console.log(`[hence] listening on http://${HOST}:${PORT} — ${voice}`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
