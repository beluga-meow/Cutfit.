// Cutfit AI pipeline (client side).
// Sends the photo + a hair mask to the Cutfit Worker, which calls
// fal-ai/qwen-image-edit/inpaint. Only pixels inside the mask can change: we
// composite the untouched original back over everything else, so identity,
// skin tone and background are preserved by construction.

import { api, ApiError, setCachedCredits } from "./store.js";
import { HAIR_TYPES } from "./catalog.js";
import { t } from "./i18n.js";

export const MAX_UPLOAD_CHARS = 9 * 1024 * 1024; // worker rejects above ~12MB

/** Strip anything that could confuse a prompt. */
export function sanitizeText(value, limit = 400) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f`"<>\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

const COLOR_NAMES = {
  "#241b18": "natural black",
  "#493027": "dark brown",
  "#76513a": "chestnut brown",
  "#b58a55": "light brown",
  "#d5c09a": "blonde",
  "#9a3b26": "auburn red",
  "#b9b9b9": "silver grey",
  "#3d6dcc": "blue",
  "#e86aa6": "pink"
};

/**
 * Build the instruction from structured barber specs — never from free text.
 * @param {object} specs from catalog.barberSpecs()
 * @param {object} opts {cutName, color, hairType, beard, view}
 */
export function buildPrompt(specs, { cutName = "", color = "", hairType = "unsure", beard = false, view = "front" } = {}) {
  const name = sanitizeText(cutName, 60);
  const hair = HAIR_TYPES[hairType]?.prompt || "natural hair";
  const colour = color ? `Hair colour: ${sanitizeText(COLOR_NAMES[color] || color, 30)}.` : "";
  const viewText =
    view === "side" ? "This is a side-profile photo; keep the profile identical." :
    view === "back" ? "This is a back view; keep the head and neck identical." :
    "This is a front-facing photo; keep the face front-facing.";

  return [
    `Replace ONLY the hair inside the masked area with a realistic ${name || "barber haircut"}.`,
    `Sides: ${sanitizeText(specs.sides, 80)}.`,
    `Top: ${sanitizeText(specs.top, 80)}.`,
    `Fade: ${sanitizeText(specs.fade, 60)}.`,
    `Part: ${sanitizeText(specs.part, 60)}.`,
    `Fringe: ${sanitizeText(specs.fringe, 60)}.`,
    `Hair texture: ${hair}.`,
    colour,
    beard ? "Neaten the beard and moustache edge in the masked area only; keep its length." : "",
    "Keep the person's face, facial features, skin tone, expression, ears, neck, clothing, background, camera angle and lighting exactly the same.",
    "Match the existing hair direction and lighting. Photorealistic barbershop result, no text, no watermark.",
    viewText
  ].filter(Boolean).join(" ");
}

function dataUrlFromCanvas(canvas, quality = 0.86) {
  return canvas.toDataURL("image/jpeg", quality);
}

function loadImage(src, crossOrigin = true) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ApiError("The generated image could not be loaded.", { code: "image" }));
    img.src = src;
  });
}

/**
 * Composite: generated pixels only where the mask is white, original elsewhere.
 * This is what protects identity — not a promise, an operation on pixels.
 */
export function compositeMasked(original, generated, maskRgba, maskW, maskH) {
  const w = original.width;
  const h = original.height;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  ctx.drawImage(generated, 0, 0, w, h);
  const gen = ctx.getImageData(0, 0, w, h);
  const origCtx = original.getContext("2d");
  const orig = origCtx.getImageData(0, 0, w, h);

  for (let y = 0; y < h; y += 1) {
    const my = Math.min(maskH - 1, Math.floor((y / h) * maskH));
    for (let x = 0; x < w; x += 1) {
      const mx = Math.min(maskW - 1, Math.floor((x / w) * maskW));
      const m = maskRgba[(my * maskW + mx) * 4] / 255;
      const a = m <= 0.02 ? 0 : m >= 0.98 ? 1 : m * m * (3 - 2 * m); // smoothstep
      if (a <= 0) {
        const i = (y * w + x) * 4;
        gen.data[i] = orig.data[i];
        gen.data[i + 1] = orig.data[i + 1];
        gen.data[i + 2] = orig.data[i + 2];
        gen.data[i + 3] = orig.data[i + 3];
      } else if (a < 1) {
        const i = (y * w + x) * 4;
        gen.data[i] = orig.data[i] * (1 - a) + gen.data[i] * a;
        gen.data[i + 1] = orig.data[i + 1] * (1 - a) + gen.data[i + 1] * a;
        gen.data[i + 2] = orig.data[i + 2] * (1 - a) + gen.data[i + 2] * a;
      }
    }
  }
  ctx.putImageData(gen, 0, 0);
  return out;
}

/** Approximate beard region mask from the lower face landmarks. */
export function beardMask(scan) {
  const { canvas, landmarks } = scan;
  if (!landmarks) return null;
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, c.width, c.height);
  const ids = [234, 172, 152, 397, 454, 291, 17, 0, 61, 132];
  ctx.beginPath();
  ids.forEach((id, i) => {
    const p = landmarks[id];
    if (!p) return;
    const x = p.x * c.width, y = p.y * c.height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  const rgba = new Uint8ClampedArray(c.width * c.height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] > 127 ? 255 : 0;
    rgba[i] = v; rgba[i + 1] = v; rgba[i + 2] = v; rgba[i + 3] = 255;
  }
  return { rgba, width: c.width, height: c.height };
}

/**
 * Run one inpaint job and return the composited canvas.
 * @param {object} args
 * @param {HTMLCanvasElement} args.image original photo
 * @param {{rgba:Uint8ClampedArray,width:number,height:number}} args.mask
 * @param {string} args.prompt
 * @param {number|null} args.seed
 * @param {(step:number,detail?:string)=>void} args.onProgress
 * @param {AbortSignal} [args.signal]
 */
export async function inpaint({ image, mask, prompt, seed = null, onProgress = () => {}, signal }) {
  const imageDataUrl = dataUrlFromCanvas(image);
  if (imageDataUrl.length > MAX_UPLOAD_CHARS) {
    throw new ApiError("This photo is too large to send. Try a smaller one.", { code: "too_large" });
  }
  const maskDataUrl = maskToPng(mask);
  if (maskDataUrl.length > MAX_UPLOAD_CHARS) {
    throw new ApiError("The hair mask is too large to send. Try a smaller photo.", { code: "too_large" });
  }

  onProgress(2);
  const submit = await api("/api/try-on", {
    method: "POST",
    timeoutMs: 30000,
    body: { imageDataUrl, maskDataUrl, prompt, seed },
    signal
  });
  if (typeof submit.creditsLeft === "number") setCachedCredits(submit.creditsLeft);
  const id = submit.request_id;
  if (!id) throw new ApiError("The AI service did not return a job id.", { code: "protocol" });

  onProgress(3, submit.queue_position);
  const started = Date.now();
  let networkErrors = 0;
  let imageUrl = null;

  while (Date.now() - started < 150000) {
    if (signal?.aborted) throw new ApiError("Generation cancelled.", { code: "aborted" });
    await new Promise((r) => setTimeout(r, networkErrors ? 4000 : 2500));
    let status;
    try {
      status = await api(`/api/status?id=${encodeURIComponent(id)}`, { timeoutMs: 15000, signal });
      networkErrors = 0;
    } catch (err) {
      networkErrors += 1;
      if (networkErrors >= 4) throw err;
      continue;
    }
    if (typeof status.creditsLeft === "number") setCachedCredits(status.creditsLeft);
    if (status.status === "COMPLETED" && status.imageUrl) {
      onProgress(5);
      imageUrl = status.imageUrl;
      break;
    }
    if (status.status === "FAILED") {
      throw new ApiError(status.error || "AI generation failed.", { code: "failed" });
    }
    onProgress(4);
  }
  if (!imageUrl) {
    throw new ApiError("This generation is taking longer than expected. Please try again.", { code: "timeout" });
  }

  const generated = await loadImage(imageUrl, true).catch(() => loadImage(imageUrl, false));
  const composited = compositeMasked(image, generated, mask.rgba, mask.width, mask.height);
  return { canvas: composited, imageUrl, seed: submit.seed ?? seed ?? null };
}

function maskToPng(mask) {
  const c = document.createElement("canvas");
  c.width = mask.width;
  c.height = mask.height;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(mask.width, mask.height);
  img.data.set(mask.rgba);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

/**
 * Full staged generation: haircut → optional colour → optional beard.
 * Each stage is a separate paid fal.ai call, so the UI asks before running the
 * optional ones.
 */
export async function generatePreview({ scan, specs, cutName, options = {}, onProgress = () => {}, signal }) {
  if (!scan?.canvas) throw new ApiError(t("try.needPhoto"), { code: "no_photo" });
  const baseMask = scan.hairMask;
  if (!baseMask) {
    throw new ApiError(
      "We could not isolate your hair in this photo. Try a photo with your hair clearly visible against the background.",
      { code: "no_mask" }
    );
  }

  const mask = { rgba: baseMask, width: scan.canvas.width, height: scan.canvas.height };
  const prompt = buildPrompt(specs, {
    cutName,
    color: options.color,
    hairType: options.hairType,
    view: options.view || "front"
  });

  onProgress(1);
  const cut = await inpaint({ image: scan.canvas, mask, prompt, seed: options.seed ?? null, onProgress, signal });

  return {
    canvas: cut.canvas,
    imageUrl: cut.imageUrl,
    seed: cut.seed,
    prompt,
    before: scan.canvas
  };
}

/** Optional colour-only pass (same mask, different instruction). */
export async function recolour({ scan, previous, colorName, seed, onProgress = () => {}, signal }) {
  const mask = { rgba: scan.hairMask, width: scan.canvas.width, height: scan.canvas.height };
  const prompt = [
    `Change only the hair colour inside the masked area to ${sanitizeText(colorName, 30)}.`,
    "Keep the exact same haircut, hair length, texture, face, skin tone, background and lighting.",
    "Photorealistic, no text, no watermark."
  ].join(" ");
  return inpaint({ image: previous || scan.canvas, mask, prompt, seed, onProgress, signal });
}

/** Optional beard tidy-up using a lower-face mask. */
export async function restyleBeard({ scan, previous, prompt = "Neaten the beard line and moustache, keep the length", seed, onProgress = () => {}, signal }) {
  const mask = beardMask(scan);
  if (!mask) throw new ApiError("We could not find the beard area in this photo.", { code: "no_mask" });
  const text = `${sanitizeText(prompt, 120)}. Only the masked beard area may change. Keep the haircut, face, skin tone, background and lighting identical. Photorealistic.`;
  return inpaint({ image: previous || scan.canvas, mask, prompt: text, seed, onProgress, signal });
}

/** Side-by-side share/download image. */
export async function makePair(before, after, label = "") {
  const w = 720;
  const hb = Math.round((before.height / before.width) * w);
  const ha = Math.round((after.height / after.width) * w);
  const h = Math.max(hb, ha);
  const c = document.createElement("canvas");
  c.width = w * 2;
  c.height = h + 46;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#101010";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(before, 0, 46, w, hb);
  ctx.drawImage(after, w, 46, w, ha);
  ctx.fillStyle = "#f5f5f5";
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillText("Before", 16, 30);
  ctx.fillText("After", w + 16, 30);
  if (label) {
    ctx.fillStyle = "#bdbdbd";
    ctx.font = "500 16px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(label.slice(0, 48), c.width - 16, 30);
  }
  return c;
}

export function canvasToBlob(canvas, type = "image/png") {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, 0.92));
}

/** Web Share with files, falling back to a download. */
export async function shareCanvases(canvases, text = "Made with Cutfit") {
  const blob = await canvasToBlob(canvases);
  if (!blob) throw new ApiError("Could not build the image.", { code: "blob" });
  const file = new File([blob], "cutfit-look.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, title: "Cutfit" });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cutfit-look.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}
