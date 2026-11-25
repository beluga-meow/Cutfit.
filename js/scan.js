// Cutfit scan — MediaPipe FaceLandmarker (VIDEO for the camera, IMAGE for
// uploads) plus ImageSegmenter hair mask for the real hairline.
//
// Verified against @mediapipe/tasks-vision 1.2.3 type definitions:
//   FaceLandmarker.detect(image)
//   FaceLandmarker.detectForVideo(videoFrame, timestampMs)
//   ImageSegmenter.segment(image) / .segmentForVideo(frame, timestampMs, cb)
//   ImageSegmenterOptions.outputCategoryMask
//   FaceLandmarker.FACE_LANDMARKS_TESSELATION / FACE_LANDMARKS_FACE_OVAL
// Result: 478 landmarks (468 mesh + 10 iris).

import * as FS from "./face-shape.js";
import { t } from "./i18n.js";

const VISION_VERSION = "1.2.3";
const VISION_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}`;
const LANDMARKER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const HAIR_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite";

export class ScanError extends Error {
  constructor(message, code = "scan") {
    super(message);
    this.name = "ScanError";
    this.code = code;
  }
}

const MESSAGES = {
  model: "The face scanner could not be downloaded. Check your connection and tap Auto-detect again.",
  unsupported: "This browser cannot run the on-device face scanner. Upload a photo and adjust the points manually.",
  camera: "Live camera is not available here. Allow camera access, or upload a photo instead.",
  cameraDenied: "Camera access was blocked. You can still upload a photo.",
  noFace: () => t("scan.q.noFace"),
  tooSmall: () => t("scan.q.faceSmall")
};

let vision = null;
let fileset = null;
let landmarker = null;
let segmenter = null;
let hairModelBroken = false;

async function loadVision() {
  if (vision) return vision;
  try {
    vision = await import(/* @vite-ignore */ `${VISION_CDN}/vision_bundle.mjs`);
    fileset = await vision.FilesetResolver.forVisionTasks(`${VISION_CDN}/wasm`);
    return vision;
  } catch (err) {
    vision = null;
    throw new ScanError(MESSAGES.model, "model");
  }
}

async function getLandmarker(runningMode, delegate = "GPU") {
  await loadVision();
  if (landmarker && landmarker.__mode === runningMode && landmarker.__delegate === delegate) return landmarker;
  try {
    if (landmarker) {
      await landmarker.setOptions({ runningMode });
      landmarker.__mode = runningMode;
      return landmarker;
    }
    landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: LANDMARKER_MODEL, delegate },
      runningMode,
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false
    });
    landmarker.__mode = runningMode;
    landmarker.__delegate = delegate;
    return landmarker;
  } catch (err) {
    if (landmarker) { try { landmarker.close(); } catch { /* ignore */ } landmarker = null; }
    if (delegate === "GPU") return getLandmarker(runningMode, "CPU");
    throw new ScanError(MESSAGES.model, "model");
  }
}

async function getSegmenter() {
  if (segmenter || hairModelBroken) return segmenter;
  try {
    await loadVision();
    segmenter = await vision.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAIR_MODEL, delegate: "CPU" },
      runningMode: "IMAGE",
      outputCategoryMask: true,
      outputConfidenceMasks: false
    });
    return segmenter;
  } catch {
    // Hair segmentation is an enhancement: if the model will not load we fall
    // back to the brow line and say so in the UI instead of failing the scan.
    hairModelBroken = true;
    segmenter = null;
    return null;
  }
}

export function hairlineAvailable() {
  return Boolean(segmenter) && !hairModelBroken;
}

/** Warm the models up in the background (called from the scan tab). */
export async function preload() {
  await getLandmarker("IMAGE").catch(() => {});
  await getSegmenter().catch(() => {});
}

// ------------------------------------------------------------------ pixels

function sampleCanvas(source, width, height) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, width, height);
  return { canvas: c, ctx, data: ctx.getImageData(0, 0, width, height).data };
}

/** Brightness + blur + glare from a downscaled copy of the frame. */
export function analysePixels(source, box = null) {
  const S = 160;
  const { data, ctx } = sampleCanvas(source, S, S);
  const gray = new Float32Array(S * S);
  let sum = 0, blown = 0, black = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    gray[p] = l;
    sum += l;
    if (l > 246) blown += 1;
    if (l < 12) black += 1;
  }
  const total = S * S;
  const brightness = sum / total;

  // Variance of Laplacian over the central region only, so the background does
  // not dominate. Thresholds are empirical for a 160px sample, not a lab metric.
  let lapSum = 0, lapSq = 0, n = 0;
  const x0 = box ? Math.max(1, Math.floor(box.left * S)) : Math.floor(S * 0.2);
  const x1 = box ? Math.min(S - 2, Math.ceil(box.right * S)) : Math.floor(S * 0.8);
  const y0 = box ? Math.max(1, Math.floor(box.top * S)) : Math.floor(S * 0.2);
  const y1 = box ? Math.min(S - 2, Math.ceil(box.bottom * S)) : Math.floor(S * 0.8);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = y * S + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - S] - gray[i + S];
      lapSum += lap;
      lapSq += lap * lap;
      n += 1;
    }
  }
  const mean = n ? lapSum / n : 0;
  const blur = n ? lapSq / n - mean * mean : 0;
  ctx.canvas.width = 1; // free memory early
  return {
    brightness,
    blur,
    glare: blown / total,
    dark: black / total
  };
}

/** Pitch/yaw/roll in degrees, estimated from landmark geometry (heuristic). */
export function estimatePose(landmarks) {
  if (!landmarks || landmarks.length < 468) return { yaw: 0, pitch: 0, roll: 0 };
  const L = (i) => landmarks[i];
  const eyeL = L(33), eyeR = L(263), nose = L(1), chin = L(152), brow = L(9);
  const eyeMid = { x: (eyeL.x + eyeR.x) / 2, y: (eyeL.y + eyeR.y) / 2 };
  const eyeDist = Math.hypot(eyeR.x - eyeL.x, eyeR.y - eyeL.y) || 1e-6;
  const yaw = (Math.asin(Math.max(-1, Math.min(1, ((nose.x - eyeMid.x) / eyeDist) * 2))) * 180) / Math.PI;
  const roll = (Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x) * 180) / Math.PI;
  const span = Math.max(1e-6, chin.y - eyeMid.y);
  const pitch = ((nose.y - eyeMid.y) / span - 0.52) * 120;
  return { yaw, pitch, roll };
}

/**
 * Glasses / hat / hair-over-face hint.
 * These are heuristics, not a classifier: a dark horizontal band at eye level
 * plus a lot of hair-coloured pixels above the brow. We only use it to nudge
 * the user, never to block a scan outright.
 */
export function detectOcclusion(source, landmarks, faceBox, hairMask) {
  const issues = [];
  if (landmarks && faceBox) {
    const S = 120;
    const { data } = sampleCanvas(source, S, S);
    const bandTop = Math.floor((faceBox.top + faceBox.height * 0.34) * S);
    const bandBottom = Math.floor((faceBox.top + faceBox.height * 0.5) * S);
    const bandLeft = Math.floor((faceBox.left + faceBox.width * 0.2) * S);
    const bandRight = Math.floor((faceBox.left + faceBox.width * 0.8) * S);
    let dark = 0, count = 0, luma = 0;
    for (let y = bandTop; y < bandBottom; y += 1) {
      for (let x = bandLeft; x < bandRight; x += 1) {
        const i = (y * S + x) * 4;
        const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        luma += l;
        if (l < 58) dark += 1;
        count += 1;
      }
    }
    if (count) {
      const darkRatio = dark / count;
      const meanLuma = luma / count;
      if (darkRatio > 0.55 && meanLuma < 70) issues.push("glasses");
    }
  }
  if (hairMask && faceBox) {
    // Hair pixels covering the upper third of the face.
    const { data: m, width, height } = hairMask;
    const x0 = Math.floor((faceBox.left + faceBox.width * 0.2) * width);
    const x1 = Math.ceil((faceBox.left + faceBox.width * 0.8) * width);
    const y0 = Math.floor(faceBox.top * height);
    const y1 = Math.ceil((faceBox.top + faceBox.height * 0.22) * height);
    let hair = 0, count = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        if (m[(y * width + x) * 4] > 127) hair += 1;
        count += 1;
      }
    }
    if (count && hair / count > 0.55) issues.push("hair");
  }
  return issues;
}

// ------------------------------------------------------------------- masks

/**
 * Build a white-on-black RGBA mask from a MediaPipe category mask.
 * `dilate` grows the mask a little so the hair edge blends.
 */
export function buildMask(category, width, height, { dilate = 2 } = {}) {
  const out = new Uint8ClampedArray(width * height * 4);
  const cw = category.width;
  const ch = category.height;
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(ch - 1, Math.floor((y / height) * ch));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(cw - 1, Math.floor((x / width) * cw));
      const hair = category.data[sy * cw + sx] === 1;
      const i = (y * width + x) * 4;
      const v = hair ? 255 : 0;
      out[i] = v; out[i + 1] = v; out[i + 2] = v; out[i + 3] = 255;
    }
  }
  if (dilate > 0) return dilateMask(out, width, height, dilate);
  return out;
}

function dilateMask(rgba, width, height, radius) {
  const out = new Uint8ClampedArray(rgba);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4] > 127) continue;
      let hit = false;
      for (let dy = -radius; dy <= radius && !hit; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const ny = y + dy, nx = x + dx;
          if (ny < 0 || nx < 0 || ny >= height || nx >= width) continue;
          if (rgba[(ny * width + nx) * 4] > 127) { hit = true; break; }
        }
      }
      if (hit) {
        const i = (y * width + x) * 4;
        out[i] = 255; out[i + 1] = 255; out[i + 2] = 255;
      }
    }
  }
  return out;
}

/** RGBA mask -> PNG data URL, for fal.ai's mask_url. */
export function maskToDataUrl(rgba, width, height) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(width, height);
  img.data.set(rgba);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

export function maskCoverage(rgba) {
  let hair = 0;
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i] > 127) hair += 1;
  return hair / (rgba.length / 4);
}

// ------------------------------------------------------------------ drawing

let tess = null;
let oval = null;

function connections() {
  if (tess || !vision) return { tess: tess || [], oval: oval || [] };
  try {
    tess = vision.FaceLandmarker.FACE_LANDMARKS_TESSELATION;
    oval = vision.FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
  } catch {
    tess = [];
    oval = [];
  }
  return { tess, oval };
}

/**
 * Light contour + mesh, no dots (the old dot overlay is gone).
 * Call on the overlay canvas after sizing it to the video/image.
 */
export function drawMesh(ctx, landmarks, width, height, { color = "rgba(255,255,255,.30)", ovalColor = "rgba(255,255,255,.85)", lineWidth = 1 } = {}) {
  if (!landmarks) return;
  const { tess: T, oval: O } = connections();
  ctx.save();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;
  ctx.beginPath();
  for (const c of T || []) {
    const a = landmarks[c.start], b = landmarks[c.end];
    if (!a || !b) continue;
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
  }
  ctx.stroke();
  if (O && O.length) {
    ctx.strokeStyle = ovalColor;
    ctx.lineWidth = lineWidth * 1.6;
    ctx.beginPath();
    for (const c of O) {
      const a = landmarks[c.start], b = landmarks[c.end];
      if (!a || !b) continue;
      ctx.moveTo(a.x * width, a.y * height);
      ctx.lineTo(b.x * width, b.y * height);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** The oval guide shown over the live camera. */
export function drawOval(ctx, width, height, { active = false } = {}) {
  ctx.save();
  ctx.strokeStyle = active ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.55)";
  ctx.lineWidth = Math.max(2, width / 240);
  ctx.setLineDash(active ? [] : [width / 60, width / 60]);
  ctx.beginPath();
  ctx.ellipse(width / 2, height * 0.47, width * 0.27, height * 0.36, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------ quality gate

/**
 * Turn raw signals into one verdict the UI can show.
 * @returns {{ok:boolean, score:number, message:string, issues:string[], progress:number}}
 */
export function judge({ landmarks, pose, pixels, size, center, occlusion = [] }) {
  const issues = [];
  if (!landmarks) {
    return { ok: false, score: 0, message: t("scan.q.noFace"), issues: ["noFace"], progress: 0 };
  }
  if (size < 0.2) issues.push("moveCloser");
  if (size > 0.72) issues.push("tooFar");
  if (center > 0.14) issues.push("center");
  if (Math.abs(pose.yaw) > 14) issues.push("lookStraight");
  if (Math.abs(pose.pitch) > 15) issues.push("lookStraight");
  if (Math.abs(pose.roll) > 12) issues.push("lookStraight");
  if (pixels.brightness < 62 || pixels.dark > 0.35) issues.push("tooDark");
  if (pixels.brightness > 208 || pixels.glare > 0.16) issues.push("overexposed");
  if (pixels.blur < 22) issues.push("blurry");
  if (occlusion.includes("glasses") || occlusion.includes("hair")) issues.push("glasses");

  const penalties = { moveCloser: 0.3, tooFar: 0.16, center: 0.14, lookStraight: 0.2, tooDark: 0.24, overexposed: 0.18, blurry: 0.2, glasses: 0.12 };
  const score = Math.max(0, 1 - issues.reduce((s, i) => s + (penalties[i] || 0), 0));
  const ok = issues.length === 0 || (issues.length === 1 && issues[0] === "lookStraight" && score >= 0.8);
  const message = issues.length ? t(`scan.q.${issues[0]}`) : t("scan.q.ready");
  return { ok, score, message, issues, progress: Math.min(1, score / 0.85) };
}

// ------------------------------------------------------------- image input

/** Normalise any source into a working canvas (max 1024px on the long edge). */
export function toWorkingCanvas(source, max = 1024) {
  const w = source.videoWidth || source.naturalWidth || source.width;
  const h = source.videoHeight || source.naturalHeight || source.height;
  if (!w || !h) throw new ScanError("That image could not be read. Try a JPG or PNG.", "decode");
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Full analysis of a still image (upload or camera capture).
 * Runs IMAGE-mode landmarker + segmenter, then the same quality gate.
 */
export async function analyzeImage(source, { onStatus = () => {} } = {}) {
  const canvas = toWorkingCanvas(source);
  onStatus("landmarks");
  const lm = await getLandmarker("IMAGE");
  let result;
  try {
    result = lm.detect(canvas);
  } catch (err) {
    throw new ScanError("The scanner could not read this photo. Try another JPG or PNG.", "detect");
  }
  const landmarks = result?.faceLandmarks?.[0] || null;
  if (!landmarks || landmarks.length < 468) {
    throw new ScanError(t("scan.q.noFace"), "noFace");
  }

  const faceBox = FS.faceBoxFromLandmarks(landmarks);
  const pose = estimatePose(landmarks);
  const pixels = analysePixels(canvas, faceBox);

  onStatus("hair");
  let category = null;
  const seg = await getSegmenter();
  if (seg) {
    try {
      if (seg.__mode !== "IMAGE") { await seg.setOptions({ runningMode: "IMAGE" }); seg.__mode = "IMAGE"; }
      const out = seg.segment(canvas);
      if (out?.categoryMask) {
        category = { data: out.categoryMask.getAsUint8Array(), width: out.categoryMask.width, height: out.categoryMask.height };
        out.categoryMask.close?.();
      }
      out?.close?.();
    } catch {
      category = null;
    }
  }

  const hairMask = category ? buildMask(category, canvas.width, canvas.height) : null;
  const hairlineY = hairMask ? FS.hairlineFromMask(category, faceBox) : null;
  const measurements = FS.measureLandmarks(landmarks, {
    aspect: canvas.width / canvas.height,
    hairlineY
  });
  const size = faceBox.width;
  const center = Math.abs((faceBox.left + faceBox.right) / 2 - 0.5);
  const occlusion = detectOcclusion(canvas, landmarks, faceBox, hairMask);
  const quality = judge({ landmarks, pose, pixels, size, center, occlusion });
  if (!measurements) throw new ScanError(t("scan.q.uploadBad"), "measure");

  return {
    canvas,
    landmarks,
    faceBox,
    measurements,
    hairMask,
    hairlineY,
    pose,
    pixels,
    quality,
    occlusion,
    source: "image",
    at: Date.now()
  };
}

// -------------------------------------------------------------- live camera

/**
 * Start the live scan loop.
 * @param {object} o
 * @param {HTMLVideoElement} o.video already playing
 * @param {HTMLCanvasElement} o.overlay
 * @param {(s:{message:string,score:number,issues:string[],progress:number,ok:boolean,landmarks:any})=>void} o.onFrame
 * @param {(capture:()=>Promise<object>)=>void} [o.onReady] called once models are loaded
 * @param {(err:Error)=>void} o.onError
 * @returns {{stop:()=>void}}
 */
export function startLiveCamera({ video, overlay, onFrame, onReady, onError }) {
  const ctx = overlay.getContext("2d");
  let running = true;
  let raf = 0;
  let lastTs = -1;
  let lastVideoTime = -1;
  let goodSince = 0;
  let autoCaptured = false;
  let frames = [];
  let segAt = 0;
  let hairMask = null;
  let landmarks = null;
  let box = null;

  const capture = async () => {
    const canvas = toWorkingCanvas(video);
    return analyzeImage(canvas);
  };

  (async () => {
    try {
      const lm = await getLandmarker("VIDEO");
      await getSegmenter();
      onReady?.(capture);
      loop(lm);
    } catch (err) {
      onError?.(err);
    }
  })();

  function loop(lm) {
    if (!running) return;
    raf = requestAnimationFrame(() => loop(lm));
    if (video.readyState < 2) return;
    const now = performance.now();
    if (video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;

    overlay.width = video.videoWidth || 640;
    overlay.height = video.videoHeight || 480;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    let result = null;
    try {
      // MediaPipe requires a monotonically increasing timestamp.
      const ts = Math.max(now, lastTs + 1);
      lastTs = ts;
      result = lm.detectForVideo(video, ts);
    } catch {
      return;
    }
    landmarks = result?.faceLandmarks?.[0] || null;

    const pixels = analysePixels(video);
    let pose = { yaw: 0, pitch: 0, roll: 0 };
    let size = 0;
    let center = 1;
    if (landmarks) {
      box = FS.faceBoxFromLandmarks(landmarks);
      pose = estimatePose(landmarks);
      size = box ? box.width : 0;
      center = box ? Math.abs((box.left + box.right) / 2 - 0.5) : 1;
    }

    // Hair segmentation is heavier, so run it a few times a second at most.
    if (now - segAt > 320 && segmenter) {
      segAt = now;
      try {
        if (segmenter.__mode !== "VIDEO") { segmenter.setOptions({ runningMode: "VIDEO" }); segmenter.__mode = "VIDEO"; }
        segmenter.segmentForVideo(video, Math.max(now, lastTs), (out) => {
          if (out?.categoryMask) {
            const cat = {
              data: out.categoryMask.getAsUint8Array(),
              width: out.categoryMask.width,
              height: out.categoryMask.height
            };
            hairMask = buildMask(cat, overlay.width, overlay.height, { dilate: 0 });
          }
          out?.close?.();
        });
      } catch {
        /* keep going without the hair mask */
      }
    }

    const occlusion = landmarks && box
      ? detectOcclusion(video, landmarks, box, hairMask ? downscaleMask(hairMask, overlay.width, overlay.height, 120) : null)
      : [];
    const verdict = judge({ landmarks, pose, pixels, size, center, occlusion });

    drawOval(ctx, overlay.width, overlay.height, { active: verdict.ok });
    if (landmarks) {
      drawMesh(ctx, landmarks, overlay.width, overlay.height, {
        lineWidth: Math.max(1, overlay.width / 900)
      });
    }

    onFrame?.({ ...verdict, landmarks });

    if (verdict.ok) {
      if (!goodSince) goodSince = now;
      if (now - goodSince > 1000 && !autoCaptured) {
        autoCaptured = true;
        onFrame?.({ ...verdict, message: t("scan.q.captured"), autoCapture: true });
      }
    } else {
      goodSince = 0;
    }
  }

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, overlay.width, overlay.height);
    },
    capture,
    get goodFor() {
      return goodSince ? performance.now() - goodSince : 0;
    }
  };
}

function downscaleMask(rgba, width, height, target) {
  const scale = target / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(height - 1, Math.floor((y / h) * height));
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(width - 1, Math.floor((x / w) * width));
      const v = rgba[(sy * width + sx) * 4];
      const i = (y * w + x) * 4;
      out[i] = v; out[i + 1] = v; out[i + 2] = v; out[i + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/** Average several capture frames for a stable measurement. */
export function averageFrames(results) {
  const frames = results.map((r) => r?.measurements).filter(Boolean);
  const averaged = FS.averageMeasurements(frames);
  const quality = results.reduce((s, r) => s + (r?.quality?.score || 0), 0) / Math.max(1, results.length);
  return { measurements: averaged, quality, frames: frames.length };
}

/** Tessellation/oval connections for the 3D viewer (loaded lazily). */
export function meshConnections() {
  return connections();
}

export { FS as faceMath };
