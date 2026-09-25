/**
 * The app icon, drawn from its own description.
 *
 * Every size the app ships — the iOS icon, the web icons, the favicon — comes
 * from the geometry below, so changing the mark means changing one file and
 * running `node tools/icon.mjs` rather than editing eight PNGs by hand and
 * discovering months later that two of them were never updated.
 *
 * Written against Node alone: no image library, a supersampled rasteriser for
 * the edges and zlib for the PNG. The shapes are circles and rectangles, and
 * that is the whole reason this is possible in a hundred lines.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

/** Two decimals is plenty, and keeps the written files readable. */
const n = (value) => Number(value.toFixed(2));

/* ---- the mark, in a 20 × 20 square ---- */

/**
 * Ice and two blues.
 *
 * The petals are lit rather than flat: each carries a gradient down its own
 * diagonal, deep opposite bright, and the tile behind them is a pale blue
 * that lifts towards the middle. At 40 pixels the gradients read as depth;
 * flat fills at that size read as paper.
 */
const DEEP = [
  [0x0a, 0x53, 0xef],
  [0x36, 0x9d, 0xff],
];
const LIGHT = [
  [0x3a, 0xc4, 0xff],
  [0x2b, 0x7f, 0xf2],
];
const ICE = [
  [0xf7, 0xfb, 0xff],
  [0xe2, 0xef, 0xfc],
];
/** Where the pale tile is at its lightest, and how far the lift reaches. */
const GLOW = { x: 10, y: 9, radius: 11 };

/**
 * Four petals in a square: deep and bright on each diagonal.
 *
 * Each is a square with one corner left sharp and the other three swept round,
 * and each sharp corner points out to a corner of the tile — so the four
 * together hold the square while the curves turn inwards. Not a letter: a
 * thing you recognise across a home screen, which at that size a letter in a
 * box rarely is.
 */
const MARK = { span: 11.4, gap: 0.55, radius: 2.45 };

const LEAVES = (() => {
  const size = (MARK.span - MARK.gap) / 2;
  const start = 10 - MARK.span / 2;
  const far = 10 + MARK.gap / 2;
  return [
    { x0: start, y0: start, sharp: 'tl', ramp: DEEP },
    { x0: far, y0: start, sharp: 'tr', ramp: LIGHT },
    { x0: start, y0: far, sharp: 'bl', ramp: LIGHT },
    { x0: far, y0: far, sharp: 'br', ramp: DEEP },
  ].map((leaf) => ({ ...leaf, x1: leaf.x0 + size, y1: leaf.y0 + size }));
})();

/** Two colours mixed, `t` from 0 to 1. */
const mix = (from, to, t) => {
  const k = Math.min(1, Math.max(0, t));
  return [0, 1, 2].map((i) => Math.round(from[i] + (to[i] - from[i]) * k));
};

/** A petal's colour at a point: along its own top-left to bottom-right. */
const leafColour = (x, y, leaf) =>
  mix(leaf.ramp[0], leaf.ramp[1], (x - leaf.x0 + (y - leaf.y0)) / ((leaf.x1 - leaf.x0) * 2));

/** The tile behind the petals: pale blue, lifted towards the middle. */
const iceAt = (x, y) => mix(ICE[0], ICE[1], Math.hypot(x - GLOW.x, y - GLOW.y) / GLOW.radius);

/**
 * A square with three corners swept round and one left square. Written as a
 * point test rather than a path so the rasteriser and the SVG can be built
 * from the same four numbers.
 */
function inLeaf(x, y, leaf) {
  const { x0, y0, x1, y1, sharp } = leaf;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const r = MARK.radius;
  for (const corner of ['tl', 'tr', 'bl', 'br']) {
    if (corner === sharp) continue;
    // Distance into the corner's rounded quarter; outside it, the point is
    // beyond the sweep and does not belong to the shape.
    const dx = corner[1] === 'l' ? x0 + r - x : x - (x1 - r);
    const dy = corner[0] === 't' ? y0 + r - y : y - (y1 - r);
    if (dx > 0 && dy > 0 && Math.hypot(dx, dy) > r) return false;
  }
  return true;
}

/** The petal a point falls in, if any. */
const leafAt = (x, y) => LEAVES.find((leaf) => inLeaf(x, y, leaf));

/** Rounded square, for the icons nobody else masks. */
function inTile(x, y, radius) {
  if (radius <= 0) return true;
  const cx = Math.min(Math.max(x, radius), 20 - radius);
  const cy = Math.min(Math.max(y, radius), 20 - radius);
  return Math.hypot(x - cx, y - cy) <= radius;
}

/** The colour at one point of the square, or null outside the tile. */
function sample(x, y, radius) {
  if (!inTile(x, y, radius)) return null;
  const leaf = leafAt(x, y);
  return leaf ? leafColour(x, y, leaf) : iceAt(x, y);
}

/* ---- rasteriser ---- */

const SUB = 4; // samples per pixel, per axis

/**
 * Draw at `size` pixels. `radius` is the tile's corner rounding in the 20-unit
 * space; 0 leaves a full square, which is what iOS wants — it does its own
 * masking, and an icon with transparent corners is rejected.
 *
 * `inset` shrinks the artwork inside the square, for the maskable icon whose
 * corners Android may crop.
 */
function draw(size, { radius = 0, inset = 0 } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = 20 / size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          // The centre of each sub-pixel, in the 20-unit square.
          let x = (px + (sx + 0.5) / SUB) * scale;
          let y = (py + (sy + 0.5) / SUB) * scale;
          if (inset) {
            x = (x - 10) / (1 - inset / 10) + 10;
            y = (y - 10) / (1 - inset / 10) + 10;
          }
          const colour = inset && (x < 0 || x > 20 || y < 0 || y > 20) ? ICE[1] : sample(x, y, radius);
          if (!colour) continue;
          r += colour[0];
          g += colour[1];
          b += colour[2];
          a += 255;
        }
      }
      const samples = SUB * SUB;
      const i = (py * size + px) * 4;
      // Colours are averaged over the samples that landed on the tile, so an
      // edge pixel is the right colour at partial opacity rather than a
      // darkened one at full opacity.
      const covered = a / 255;
      pixels[i] = covered ? Math.round(r / covered) : 0;
      pixels[i + 1] = covered ? Math.round(g / covered) : 0;
      pixels[i + 2] = covered ? Math.round(b / covered) : 0;
      pixels[i + 3] = Math.round(a / samples);
    }
  }
  return pixels;
}

/* ---- PNG ---- */

const CRC = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return (buffer) => {
    let c = -1;
    for (const byte of buffer) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * `alpha: false` writes plain RGB. Apple rejects an app icon that carries an
 * alpha channel at all — even one that is opaque in every pixel — so the
 * icons iOS uses are written without one.
 */
function png(size, pixels, alpha = true) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = alpha ? 6 : 2; // RGBA or RGB
  const bytes = alpha ? 4 : 3;
  // Each row is prefixed with its filter type; 0 is "none", which costs a few
  // kilobytes and saves every reader a decision.
  const raw = Buffer.alloc(size * (size * bytes + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * bytes + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const from = (y * size + x) * 4;
      const to = row + 1 + x * bytes;
      raw[to] = pixels[from];
      raw[to + 1] = pixels[from + 1];
      raw[to + 2] = pixels[from + 2];
      if (alpha) raw[to + 3] = pixels[from + 3];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---- what the app ships ---- */

const FILES = [
  // iOS masks the corners itself and refuses transparency.
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, { alpha: false }],
  ['public/apple-touch-icon.png', 180, { alpha: false }],
  ['public/icon-192.png', 192, { radius: 5 }],
  ['public/icon-512.png', 512, { radius: 5 }],
  // Android crops this one to whatever shape the launcher likes, so the mark
  // sits well inside it.
  ['public/icon-maskable-512.png', 512, { inset: 2.2 }],
  // Google's OAuth consent screen asks for exactly this size, opaque.
  ['docs/store/google-oauth-logo-120.png', 120, { alpha: false }],
];

for (const [path, size, options] of FILES) {
  const { alpha = true, ...shape } = options;
  writeFileSync(path, png(size, draw(size, shape), alpha));
  console.log(`${path}  ${size}×${size}  ${alpha ? 'RGBA' : 'RGB'}`);
}

/* ---- the launch screen ---- */

/**
 * The mark alone on the app's own charcoal, small and centred.
 *
 * It was cream on a dark launch background, which flashed a pale square for
 * the moment before the app appeared. The same four petals, in the same
 * blues, with the pale tile left out: on charcoal the mark is the only lit
 * thing, which is what a launch screen should be.
 */
const CHARCOAL = [0x23, 0x23, 0x26];

function splash(size) {
  const pixels = Buffer.alloc(size * size * 4);
  // The mark's own bounding box, so it is the mark that sits centred rather
  // than the 20-unit square it was drawn in.
  const box = { x: 10, y: 10, width: MARK.span };
  const share = 0.1; // of the canvas width
  const scale = box.width / (size * share);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const x = (px + (sx + 0.5) / SUB - size / 2) * scale + box.x;
          const y = (py + (sy + 0.5) / SUB - size / 2) * scale + box.y;
          const leaf = leafAt(x, y);
          const colour = leaf ? leafColour(x, y, leaf) : CHARCOAL;
          r += colour[0];
          g += colour[1];
          b += colour[2];
        }
      }
      const samples = SUB * SUB;
      const i = (py * size + px) * 4;
      pixels[i] = Math.round(r / samples);
      pixels[i + 1] = Math.round(g / samples);
      pixels[i + 2] = Math.round(b / samples);
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

// Three files, one image: the asset catalogue asks for 1x, 2x and 3x, and a
// square this size is already more than any of them need.
const splashPixels = splash(2732);
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  writeFileSync(`ios/App/App/Assets.xcassets/Splash.imageset/${name}`, png(2732, splashPixels, false));
  console.log(`ios/App/App/Assets.xcassets/Splash.imageset/${name}  2732×2732  RGB`);
}

const hex = (colour) => `#${colour.map((c) => c.toString(16).padStart(2, '0')).join('')}`;

/**
 * One petal as a path: the outline clockwise from the top-left, each corner
 * either a quarter-circle or a right angle. The same four numbers the
 * rasteriser uses, so the favicon cannot drift from the icons.
 */
function leafPath(leaf) {
  const r = MARK.radius;
  const { x0, y0, x1, y1, sharp } = leaf;
  const at = (corner) => (corner === sharp ? 0 : r);
  const [tl, tr, br, bl] = ['tl', 'tr', 'br', 'bl'].map(at);
  const arc = (rr, x, y) => (rr ? `A${rr} ${rr} 0 0 1 ${n(x)} ${n(y)}` : `L${n(x)} ${n(y)}`);
  return [
    `M${n(x0 + tl)} ${n(y0)}`,
    `H${n(x1 - tr)}`,
    arc(tr, x1, y0 + tr),
    `V${n(y1 - br)}`,
    arc(br, x1 - br, y1),
    `H${n(x0 + bl)}`,
    arc(bl, x0, y1 - bl),
    `V${n(y0 + tl)}`,
    arc(tl, x0 + tl, y0),
    'Z',
  ].join('');
}

/** The favicon stays vector: the same geometry, written as SVG. */
const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">',
  // The same ramps the rasteriser mixes, declared once and pointed at.
  '<defs>',
  `<radialGradient id="ice" cx="${n(GLOW.x / 20)}" cy="${n(GLOW.y / 20)}" r="${n(GLOW.radius / 20)}">`,
  `<stop offset="0" stop-color="${hex(ICE[0])}"/><stop offset="1" stop-color="${hex(ICE[1])}"/>`,
  '</radialGradient>',
  ...LEAVES.map(
    (leaf, i) =>
      `<linearGradient id="p${i}" x1="${n(leaf.x0)}" y1="${n(leaf.y0)}" x2="${n(leaf.x1)}" y2="${n(leaf.y1)}" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0" stop-color="${hex(leaf.ramp[0])}"/><stop offset="1" stop-color="${hex(leaf.ramp[1])}"/>` +
      '</linearGradient>',
  ),
  '</defs>',
  '<rect width="20" height="20" rx="5" fill="url(#ice)"/>',
  ...LEAVES.map((leaf, i) => `<path d="${leafPath(leaf)}" fill="url(#p${i})"/>`),
  '</svg>',
].join('');
writeFileSync('public/favicon.svg', `${svg}\n`);
console.log('public/favicon.svg');
