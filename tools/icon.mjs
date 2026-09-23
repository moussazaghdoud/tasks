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

/* ---- the mark, in a 20 × 20 square ---- */

const PAPER = [0xf1, 0xef, 0xe9];
const INK = [0x1d, 0x1c, 0x1a];
const TEAL = [0x1e, 0x67, 0x6c];

/**
 * The ring is centred in the square, and the dot hangs off its top-right
 * corner. It used to sit low and left so that ring and dot together balanced
 * the tile — which left the H, centred in the ring as a letter must be,
 * visibly off-centre in the icon. Composition follows the letter.
 */
const RING = { x: 10, y: 10, r: 5.4, w: 1.85 };
const DOT = { x: 15.2, y: 4.8, r: 2.4 };
/**
 * The H sits in the ring, in the same ink and close to the same weight — it
 * reads as drawn by the same pen rather than typed into the middle. Its
 * corners clear the ring's inner edge by half a stroke, which is what keeps
 * the counter from looking clogged at 40 pixels.
 */
const H = { halfWidth: 2.55, halfHeight: 2.7, stem: 1.3, bar: 1.15 };

const inRing = (x, y) => Math.abs(Math.hypot(x - RING.x, y - RING.y) - RING.r) <= RING.w / 2;
const inDot = (x, y) => Math.hypot(x - DOT.x, y - DOT.y) <= DOT.r;

function inH(x, y) {
  const dx = x - RING.x;
  const dy = y - RING.y;
  if (Math.abs(dy) > H.halfHeight) return false;
  const leftStem = Math.abs(dx + (H.halfWidth - H.stem / 2)) <= H.stem / 2;
  const rightStem = Math.abs(dx - (H.halfWidth - H.stem / 2)) <= H.stem / 2;
  const crossbar = Math.abs(dy) <= H.bar / 2 && Math.abs(dx) <= H.halfWidth;
  return leftStem || rightStem || crossbar;
}

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
  if (inDot(x, y)) return TEAL;
  if (inRing(x, y) || inH(x, y)) return INK;
  return PAPER;
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
          const colour = inset && (x < 0 || x > 20 || y < 0 || y > 20) ? PAPER : sample(x, y, radius);
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
];

for (const [path, size, options] of FILES) {
  const { alpha = true, ...shape } = options;
  writeFileSync(path, png(size, draw(size, shape), alpha));
  console.log(`${path}  ${size}×${size}  ${alpha ? 'RGBA' : 'RGB'}`);
}

/* ---- the launch screen ---- */

/**
 * The mark alone on the app's own graphite, small and centred.
 *
 * It was cream on a dark launch background, which flashed a pale square for
 * the moment before the app appeared. Same geometry, other way round: paper
 * ink on graphite, with the accent the dark theme actually uses.
 */
const GRAPHITE = [0x0b, 0x0d, 0x10];
const DARK_ACCENT = [0x4f, 0xe3, 0xc1];

function splash(size) {
  const pixels = Buffer.alloc(size * size * 4);
  // The mark's own bounding box, so it is the mark that sits centred rather
  // than the 20-unit square it was drawn in.
  const left = RING.x - RING.r - RING.w / 2;
  const right = Math.max(RING.x + RING.r + RING.w / 2, DOT.x + DOT.r);
  const top = Math.min(RING.y - RING.r - RING.w / 2, DOT.y - DOT.r);
  const bottom = RING.y + RING.r + RING.w / 2;
  const box = { x: (left + right) / 2, y: (top + bottom) / 2, width: right - left };
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
          const colour = inDot(x, y) ? DARK_ACCENT : inRing(x, y) || inH(x, y) ? PAPER : GRAPHITE;
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

/** Two decimals is plenty, and keeps the file readable. */
const n = (value) => Number(value.toFixed(2));

/** The favicon stays vector: the same geometry, written as SVG. */
const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">',
  '<rect width="20" height="20" rx="5" fill="#F1EFE9"/>',
  `<circle cx="${RING.x}" cy="${RING.y}" r="${RING.r}" fill="none" stroke="#1D1C1A" stroke-width="${RING.w}"/>`,
  // A stroke is centred on its path, so the stems sit half a stroke inside
  // the H's width — exactly where the rasteriser puts them.
  `<path d="M${n(RING.x - H.halfWidth + H.stem / 2)} ${n(RING.y - H.halfHeight)}v${n(H.halfHeight * 2)}" stroke="#1D1C1A" stroke-width="${H.stem}" stroke-linecap="butt"/>`,
  `<path d="M${n(RING.x + H.halfWidth - H.stem / 2)} ${n(RING.y - H.halfHeight)}v${n(H.halfHeight * 2)}" stroke="#1D1C1A" stroke-width="${H.stem}" stroke-linecap="butt"/>`,
  `<path d="M${n(RING.x - H.halfWidth)} ${RING.y}h${n(H.halfWidth * 2)}" stroke="#1D1C1A" stroke-width="${H.bar}" stroke-linecap="butt"/>`,
  `<circle cx="${DOT.x}" cy="${DOT.y}" r="${DOT.r}" fill="#1E676C"/>`,
  '</svg>',
].join('');
writeFileSync('public/favicon.svg', `${svg}\n`);
console.log('public/favicon.svg');
