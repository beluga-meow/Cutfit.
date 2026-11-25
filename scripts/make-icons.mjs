// Generates the PNG icons and the Open Graph cover with no dependencies.
// Run: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "assets/icons";
mkdirSync(OUT, { recursive: true });

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const mix = (a, b, t) => a + (b - a) * clamp01(t);

function canvas(w, h) {
  const buf = Buffer.alloc(w * h * 4);
  const set = (x, y, [r, g, b], alpha = 1) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    buf[i] = Math.round(mix(buf[i], r, alpha));
    buf[i + 1] = Math.round(mix(buf[i + 1], g, alpha));
    buf[i + 2] = Math.round(mix(buf[i + 2], b, alpha));
    buf[i + 3] = Math.round(Math.min(255, buf[i + 3] + 255 * alpha));
  };
  return { buf, set, w, h };
}

const INK = [23, 23, 23];
const PAPER = [255, 255, 255];
const CLAY = [155, 117, 93];

function roundedSquare(c, size, radius, colour) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = Math.max(radius - x, x - (size - radius), 0);
      const dy = Math.max(radius - y, y - (size - radius), 0);
      if (Math.hypot(dx, dy) <= radius) c.set(x, y, colour, 1);
    }
  }
}

function segment(c, x1, y1, x2, y2, width, colour) {
  const minX = Math.floor(Math.min(x1, x2) - width);
  const maxX = Math.ceil(Math.max(x1, x2) + width);
  const minY = Math.floor(Math.min(y1, y2) - width);
  const maxY = Math.ceil(Math.max(y1, y2) + width);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const t = clamp01(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1));
      const px = x1 + t * dx;
      const py = y1 + t * dy;
      const d = Math.hypot(x - px, y - py);
      if (d <= width) c.set(x, y, colour, clamp01(width - d + 0.5));
    }
  }
}

function ring(c, cx, cy, radius, width, colour) {
  const r0 = radius - width;
  const r1 = radius + width;
  for (let y = Math.floor(cy - r1); y <= Math.ceil(cy + r1); y += 1) {
    for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= r0 && d <= r1) c.set(x, y, colour, clamp01(Math.min(d - r0, r1 - d) + 0.5));
    }
  }
}

function scissorsIcon(size) {
  const c = canvas(size, size);
  roundedSquare(c, size, size * 0.22, INK);
  const s = size / 512;
  // Scissors: two finger rings on the left, blades crossing to the right.
  ring(c, 168 * s, 170 * s, 62 * s, 17 * s, PAPER);
  ring(c, 168 * s, 342 * s, 62 * s, 17 * s, PAPER);
  segment(c, 156 * s, 168 * s, 392 * s, 330 * s, 15 * s, PAPER);
  segment(c, 156 * s, 344 * s, 392 * s, 182 * s, 15 * s, PAPER);
  segment(c, 392 * s, 330 * s, 440 * s, 366 * s, 13 * s, PAPER);
  segment(c, 392 * s, 182 * s, 440 * s, 146 * s, 13 * s, PAPER);
  return png(size, size, c.buf);
}

function ogCover() {
  const W = 1200;
  const H = 630;
  const c = canvas(W, H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const t = (x / W) * 0.6 + (y / H) * 0.4;
      c.set(x, y, [mix(16, 30, t), mix(16, 26, t), mix(15, 24, t)], 1);
    }
  }
  // Soft clay disc + head/scissors mark on the right.
  const cx = 860;
  const cy = 315;
  const R = 210;
  for (let y = cy - R; y <= cy + R; y += 1) {
    for (let x = cx - R; x <= cx + R; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= R) c.set(x, y, CLAY, clamp01((R - d) / 12));
    }
  }
  ring(c, cx - 62, cy - 62, 44, 12, INK);
  ring(c, cx - 62, cy + 62, 44, 12, INK);
  segment(c, cx - 70, cy - 64, cx + 96, cy + 52, 11, INK);
  segment(c, cx - 70, cy + 64, cx + 96, cy - 52, 11, INK);
  // Left: typographic bar as a brand block (font-free).
  for (let i = 0; i < 4; i += 1) {
    const x0 = 90;
    const y0 = 210 + i * 58;
    const width = [330, 250, 300, 180][i];
    for (let y = y0; y < y0 + 22; y += 1) {
      for (let x = x0; x < x0 + width; x += 1) c.set(x, y, PAPER, 0.92);
    }
  }
  for (let y = 210; y < 210 + 22; y += 1) {
    for (let x = 90; x < 90 + 330; x += 1) c.set(x, y, PAPER, 0.95);
  }
  return png(W, H, c.buf);
}

const files = [
  ["icon-192.png", scissorsIcon(192)],
  ["icon-512.png", scissorsIcon(512)],
  ["og-cover.png", ogCover()]
];
for (const [name, buf] of files) {
  const path = `${OUT}/${name}`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  console.log(`wrote ${path} (${buf.length} bytes)`);
}
