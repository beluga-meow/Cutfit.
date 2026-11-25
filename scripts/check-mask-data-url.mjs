#!/usr/bin/env node
// Does fal.ai accept the hair mask as a data URL?
//
//   FAL_KEY=... node scripts/check-mask-data-url.mjs
//
// Sends one real inpaint request to fal-ai/qwen-image-edit/inpaint with BOTH
// image_url and mask_url as PNG data URLs (exactly what js/tryon.js sends), then
// polls the queue. Costs about $0.03.
//
// Exit codes: 0 = data-URL mask accepted, 2 = rejected (use the R2 fallback),
// 3 = setup problem (no key, network), 1 = unexpected answer.
//
// No dependencies, no key in argv, nothing written to disk.

import zlib from "node:zlib";
import crypto from "node:crypto";

const MODEL = "fal-ai/qwen-image-edit/inpaint";
const SIZE = 768;

// ---------------------------------------------------------------- tiny PNG
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// ------------------------------------------------------------ test pictures
/** A crude synthetic portrait: enough for the model to have hair to replace. */
function makePortrait() {
  const p = Buffer.alloc(SIZE * SIZE * 4);
  const inEllipse = (x, y, cx, cy, rx, ry) =>
    ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const i = (y * SIZE + x) * 4;
      const shade = 168 + Math.round((y / SIZE) * 40);
      let r = shade;
      let g = shade - 6;
      let b = shade - 14;

      if (inEllipse(x, y, 384, 470, 120, 190)) {
        // neck and shoulders
        r = 214; g = 176; b = 148;
      }
      if (inEllipse(x, y, 384, 400, 150, 200)) {
        // face
        r = 232; g = 190; b = 158;
        if (inEllipse(x, y, 330, 370, 22, 12) || inEllipse(x, y, 438, 370, 22, 12)) {
          r = 46; g = 38; b = 34; // eyes
        }
        if (y > 480 && y < 492 && Math.abs(x - 384) < 40) {
          r = 150; g = 92; b = 84; // mouth
        }
      }
      if (inEllipse(x, y, 384, 268, 156, 128)) {
        // hair cap on the top of the head
        r = 58; g = 42; b = 34;
      }
      p[i] = r; p[i + 1] = g; p[i + 2] = b; p[i + 3] = 255;
    }
  }
  return p;
}

/** White = repaint (hair). Mirrors the client's segmenter mask shape. */
function makeMask() {
  const p = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const i = (y * SIZE + x) * 4;
      const inside = ((x - 384) / 168) ** 2 + ((y - 268) / 142) ** 2 <= 1 && y < 360;
      const v = inside ? 255 : 0;
      p[i] = v; p[i + 1] = v; p[i + 2] = v; p[i + 3] = 255;
    }
  }
  return p;
}

const dataUrl = (buf, type = "image/png") => `data:${type};base64,${buf.toString("base64")}`;

// ------------------------------------------------------------------- request
if (process.argv.includes("--dry-run")) {
  const portrait = encodePng(SIZE, SIZE, makePortrait());
  const mask = encodePng(SIZE, SIZE, makeMask());
  console.log(`portrait  ${portrait.length.toLocaleString()} bytes PNG ${SIZE}×${SIZE}`);
  console.log(`mask      ${mask.length.toLocaleString()} bytes PNG ${SIZE}×${SIZE}`);
  console.log("dry run: nothing sent. Drop --dry-run to make one real call (~$0.03).");
  process.exit(0);
}

const key = process.env.FAL_KEY;
if (!key) {
  console.error("FAL_KEY is not set. Run: FAL_KEY=<your key> node scripts/check-mask-data-url.mjs");
  process.exit(3);
}

const headers = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
const payload = {
  prompt:
    "Restyle only the hair into a short textured crop with a clean low fade. Keep the face, skin, ears, expression and background exactly as they are.",
  image_url: dataUrl(encodePng(SIZE, SIZE, makePortrait())),
  mask_url: dataUrl(encodePng(SIZE, SIZE, makeMask())),
  strength: 0.93,
  num_inference_steps: 30,
  seed: crypto.randomInt(1, 2 ** 31)
};

console.log(`model     ${MODEL}`);
console.log(`image     data URL, ${payload.image_url.length.toLocaleString()} chars`);
console.log(`mask      data URL, ${payload.mask_url.length.toLocaleString()} chars`);
console.log("submitting one job (~$0.03)…\n");

const started = Date.now();
let submit;
try {
  submit = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000)
  });
} catch (err) {
  console.error(`Network error: ${err.message}`);
  process.exit(3);
}

const raw = await submit.text();
let body;
try {
  body = JSON.parse(raw);
} catch {
  body = null;
}

if (!submit.ok) {
  console.error(`Submit failed: HTTP ${submit.status}`);
  console.error(raw.slice(0, 1500));
  const text = raw.toLowerCase();
  const maskish = /mask|mask_url|invalid.*url|download|fetch|image.*url|422|validation/.test(text);
  console.error(
    maskish
      ? "\n→ The request was rejected in a way that involves the inputs. Treat the mask data URL as NOT accepted; the Worker already retries with an R2-hosted mask."
      : "\n→ Rejection does not clearly point at the mask. Check the message above before changing anything."
  );
  process.exit(2);
}

const requestId = body?.request_id;
if (!requestId) {
  console.error("No request_id in the response:", raw.slice(0, 800));
  process.exit(1);
}
console.log(`queued    ${requestId} (position ${body.queue_position ?? "?"})`);

const base = `https://queue.fal.run/${MODEL}/requests/${requestId}`;
const statusUrl = body.status_url || `${base}/status`;
const responseUrl = body.response_url || base;

let last = "";
for (let i = 0; i < 60; i += 1) {
  await new Promise((r) => setTimeout(r, 2500));
  const res = await fetch(statusUrl, { headers, signal: AbortSignal.timeout(20000) });
  const state = await res.json().catch(() => ({}));
  const status = state.status || `HTTP ${res.status}`;
  if (status !== last) {
    console.log(`status    ${status}  (${Math.round((Date.now() - started) / 1000)}s)`);
    last = status;
  }
  if (status === "COMPLETED") {
    const out = await fetch(responseUrl, { headers, signal: AbortSignal.timeout(20000) });
    const result = await out.json().catch(() => ({}));
    const image = result.images?.[0];
    console.log("\n✅ Data-URL mask ACCEPTED");
    console.log(`   seed      ${result.seed ?? "n/a"}`);
    if (image) {
      const mp = ((image.width || SIZE) * (image.height || SIZE)) / 1e6;
      console.log(`   image     ${image.width}×${image.height}  ≈ $${(mp * 0.03).toFixed(3)}`);
      console.log(`   url       ${image.url}`);
      console.log("   open it and check that only the hair changed.");
    }
    console.log(`   elapsed   ${Math.round((Date.now() - started) / 1000)}s`);
    process.exit(0);
  }
  if (status === "FAILED" || status === "ERROR") {
    console.error("\n❌ Job failed:", JSON.stringify(state, null, 2).slice(0, 1500));
    process.exit(2);
  }
}

console.error("\nTimed out waiting for the job; check the fal.ai dashboard for", requestId);
process.exit(1);
