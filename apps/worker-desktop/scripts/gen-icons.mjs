import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

/**
 * Genera icone placeholder dell'app senza dipendenze (solo node:zlib): logo con il gradiente
 * indigo→fuchsia dell'header GUI + un triangolo "play". Sono segnaposto professionali ma
 * sostituibili con il branding definitivo: rigenera con `node scripts/gen-icons.mjs`.
 * - assets/icon.png (256x256): electron-builder la rileva e genera l'.ico di installer/exe.
 * - assets/tray.png (32x32): icona del tray a runtime.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(root, 'assets');

// CRC32 (PNG usa il polinomio standard).
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** RGBA 8-bit → PNG (colortype 6). */
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10-12: compression/filter/interlace = 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtro None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Segno di un punto rispetto a un segmento (per il test "dentro il triangolo").
function edge(px, py, ax, ay, bx, by) {
  return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const s = size / 256; // le coordinate sono definite su 256
  const radius = 52 * s;
  // Triangolo "play" su base 256, scalato.
  const ax = 100 * s;
  const ay = 78 * s;
  const bx = 182 * s;
  const by = 128 * s;
  const cx = 100 * s;
  const cy = 178 * s;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Angoli arrotondati: fuori dal rounded-rect → trasparente.
      const rx = Math.min(x, size - 1 - x);
      const ry = Math.min(y, size - 1 - y);
      let alpha = 255;
      if (rx < radius && ry < radius) {
        const dx = radius - rx;
        const dy = radius - ry;
        if (dx * dx + dy * dy > radius * radius) {
          alpha = 0;
        }
      }
      // Gradiente diagonale indigo(#6366f1) → fuchsia(#d946ef).
      const t = (x + y) / (2 * (size - 1));
      let r = Math.round(0x63 + (0xd9 - 0x63) * t);
      let g = Math.round(0x66 + (0x46 - 0x66) * t);
      let b = Math.round(0xf1 + (0xef - 0xf1) * t);
      // Triangolo bianco (orientamento coerente indipendentemente dal senso dei vertici).
      const d1 = edge(x, y, ax, ay, bx, by);
      const d2 = edge(x, y, bx, by, cx, cy);
      const d3 = edge(x, y, cx, cy, ax, ay);
      const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
      const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(hasNeg && hasPos)) {
        r = 255;
        g = 255;
        b = 255;
      }
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = alpha;
    }
  }
  return rgba;
}

async function main() {
  await mkdir(assetsDir, { recursive: true });
  await writeFile(join(assetsDir, 'icon.png'), encodePng(256, 256, drawIcon(256)));
  await writeFile(join(assetsDir, 'tray.png'), encodePng(32, 32, drawIcon(32)));
  console.log('Generati assets/icon.png (256x256) e assets/tray.png (32x32).');
}

main().catch((error) => {
  console.error('Generazione icone fallita:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
