/**
 * Generates public/icons/icon-192.png and icon-512.png — the monoline
 * "route to destination" mark on #0c0c0c, drawn analytically (no deps).
 * Run: node scripts/gen-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");
mkdirSync(outDir, { recursive: true });

// ── minimal PNG encoder ────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── analytic drawing ───────────────────────────────────────────────────────
const distSeg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
// coverage 0..1 from signed distance (1px soft edge)
const cov = (d) => Math.max(0, Math.min(1, 0.5 - d + 0.5));

function renderIcon(size) {
  const s = size / 100; // design space = 100x100 (matches icon.svg)
  const stroke = 4.5 * s, half = stroke / 2;
  const rgba = Buffer.alloc(size * size * 4);
  const bg = [0x0c, 0x0c, 0x0c], fg = [0xf2, 0xf2, 0xf2];
  const r = 22 * s; // corner radius

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5;

      // rounded-rect alpha
      const qx = Math.max(Math.abs(px - size / 2) - (size / 2 - r), 0);
      const qy = Math.max(Math.abs(py - size / 2) - (size / 2 - r), 0);
      const dRect = Math.hypot(qx, qy) - r;
      const aBg = cov(dRect);

      // monoline path: segments (30,76)->(50,46)->(64,33), ring at (70,27) r=5
      const d1 = distSeg(px, py, 30 * s, 76 * s, 50 * s, 46 * s) - half;
      const d2 = distSeg(px, py, 50 * s, 46 * s, 64 * s, 33 * s) - half;
      const dRing = Math.abs(Math.hypot(px - 70 * s, py - 27 * s) - 5 * s) - half;
      const aFg = cov(Math.min(d1, d2, dRing));

      const i = (y * size + x) * 4;
      for (let ch = 0; ch < 3; ch++)
        rgba[i + ch] = Math.round(bg[ch] + (fg[ch] - bg[ch]) * aFg);
      rgba[i + 3] = Math.round(aBg * 255);
    }
  }
  return encodePNG(size, rgba);
}

for (const size of [192, 512]) {
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, renderIcon(size));
  console.log("wrote", file);
}
