import type { Plugin } from 'vite';

/**
 * Translucent colours for web views older than color-mix() (Chrome 111).
 *
 * Tailwind writes `bg-paper/88` as a fixed fallback colour, then the real
 * color-mix() inside `@supports`. The fallback is worked out once, from the
 * light theme, so an Android phone whose web view was never updated showed a
 * light header over the dark app, with white text on it.
 *
 * This rewrites the built CSS so the fallback follows the theme too: every
 * `--color-x: #hex` token also gets `--rgb-x: r g b`, and every
 * `color-mix(in …, var(--color-x) N%, transparent)` gets a version before it
 * that old engines understand, `rgb(var(--rgb-x, r g b) / N%)`. Engines that
 * know color-mix() still use it.
 */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function rgbOf(hex: string): string {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
}

/** color-mix(in <space>, var(--color-x) N%, transparent) */
const MIX = /color-mix\(in [a-z]+, ?var\(--color-([a-z0-9-]+)\) ([\d.]+)%, ?transparent\)/g;

export function legacyColors(css: string): string {
  // 1. A space-separated twin for every hex colour token, wherever it is set.
  let out = css.replace(/(--color-([a-z0-9-]+):\s*(#[0-9a-f]+))(?=\s*[;}])/gi, (all, _decl, name: string, hex: string) =>
    HEX.test(hex) ? `${all};--rgb-${name}:${rgbOf(hex)}` : all,
  );

  // 2. Tailwind's fixed fallback before its @supports block: make it follow the theme.
  out = out.replace(
    /([^{}]+)\{([a-z-]+):#([0-9a-f]{6})([0-9a-f]{2})?\}(@supports \(color:color-mix\(in lab, ?red, ?red\)\)\{\1\{\2:color-mix\(in [a-z]+, ?var\(--color-([a-z0-9-]+)\) ([\d.]+)%, ?transparent\)\}\})/gi,
    (_all, selector: string, prop: string, hex: string, _alpha, supports: string, name: string, pct: string) =>
      `${selector}{${prop}:#${hex}${_alpha ?? ''};${prop}:rgb(var(--rgb-${name}, ${rgbOf(`#${hex}`)}) / ${pct}%)}${supports}`,
  );

  // 3. Our own color-mix() outside Tailwind, with no fallback at all: give it one.
  out = out.replace(/([;{])([a-z-]+):([^;{}]*color-mix\([^;{}]*)(?=[;}])/gi, (all, lead: string, prop: string, value: string) => {
    // Tailwind's own (oklab) sit inside its @supports block, already covered by step 2.
    if (prop.startsWith('--') || value.includes('in oklab')) return all;
    const plain = value.replace(MIX, (_m, name: string, pct: string) => `rgb(var(--rgb-${name}) / ${pct}%)`);
    // Something color-mix() we cannot express without it (currentcolor…): leave it.
    if (plain.includes('color-mix(')) return all;
    return `${lead}${prop}:${plain};${prop}:${value}`;
  });

  return out;
}

/** Applies legacyColors() to the CSS of a production build. */
export function legacyColorsPlugin(): Plugin {
  return {
    name: 'hence-legacy-colors',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && file.fileName.endsWith('.css') && typeof file.source === 'string') {
          file.source = legacyColors(file.source);
        }
      }
    },
  };
}
