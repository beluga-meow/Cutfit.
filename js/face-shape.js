// Cutfit face-shape math — pure functions, no DOM, no network.
// Imported by js/scan.js (live app), test/classifier.html and tests/face-shape.test.mjs.

/**
 * MediaPipe FaceLandmarker reference points (canonical 468/478 face mesh).
 * Verified against the MediaPipe face mesh topology docs:
 *   10  = forehead top centre (the mesh's hairline-ish vertex — NOT the real hairline)
 *   152 = chin bottom
 *   127 / 356 = outer forehead / temple corners
 *   234 / 454 = widest cheekbone point (tragus area)
 *   172 / 397 = jaw corner (gonion)
 *    9  = between the brows (glabella)
 *   175 / 199 = lower chin contour
 * We deliberately use the ImageSegmenter hair mask for the real hairline,
 * because landmark 10 sits on the mesh, not on the user's hair.
 */
export const LM = {
  forehead: 10,
  chin: 152,
  foreheadLeft: 127,
  foreheadRight: 356,
  cheekLeft: 234,
  cheekRight: 454,
  jawLeft: 172,
  jawRight: 397,
  brow: 9,
  chinLeft: 175,
  chinRight: 199
};

export const SHAPE_KEYS = ["oval", "round", "square", "rect", "heart", "diamond", "tri"];

export const SHAPES = {
  oval: { name: "Oval", label: "Oval" },
  round: { name: "Round", label: "Round" },
  square: { name: "Square", label: "Square" },
  rect: { name: "Rectangle", label: "Rectangle" },
  heart: { name: "Heart", label: "Heart" },
  diamond: { name: "Diamond", label: "Diamond" },
  tri: { name: "Triangle", label: "Triangle" }
};

const KEYS = ["length", "forehead", "cheek", "jaw", "jawAngle", "chin"];

// Prototype profiles. Ratios are relative to cheekbone width; jawAngle is in
// degrees at the gonion; chin is chin width relative to cheekbone width.
export const PROTOTYPES = {
  oval:    { length: 1.42, forehead: 0.88, cheek: 1.00, jaw: 0.76, jawAngle: 128, chin: 0.30 },
  round:   { length: 1.20, forehead: 0.88, cheek: 1.00, jaw: 0.80, jawAngle: 138, chin: 0.34 },
  square:  { length: 1.25, forehead: 0.96, cheek: 1.00, jaw: 0.94, jawAngle: 112, chin: 0.40 },
  rect:    { length: 1.58, forehead: 0.95, cheek: 1.00, jaw: 0.93, jawAngle: 116, chin: 0.34 },
  heart:   { length: 1.45, forehead: 0.98, cheek: 1.00, jaw: 0.62, jawAngle: 130, chin: 0.22 },
  diamond: { length: 1.45, forehead: 0.76, cheek: 1.00, jaw: 0.68, jawAngle: 124, chin: 0.24 },
  tri:     { length: 1.35, forehead: 0.78, cheek: 1.00, jaw: 1.00, jawAngle: 134, chin: 0.38 }
};

export const TOLERANCE = { length: 0.16, forehead: 0.11, cheek: 1, jaw: 0.14, jawAngle: 16, chin: 0.10 };
export const WEIGHT = { length: 0.24, forehead: 0.22, cheek: 0, jaw: 0.24, jawAngle: 0.15, chin: 0.15 };

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Read the eight reference points out of a MediaPipe landmark array. */
export function landmarksToAnchors(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 468) return null;
  const pick = (i) => {
    const p = landmarks[i];
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y, z: p.z || 0 } : null;
  };
  const anchors = {
    forehead: pick(LM.forehead),
    chin: pick(LM.chin),
    foreheadLeft: pick(LM.foreheadLeft),
    foreheadRight: pick(LM.foreheadRight),
    cheekLeft: pick(LM.cheekLeft),
    cheekRight: pick(LM.cheekRight),
    jawLeft: pick(LM.jawLeft),
    jawRight: pick(LM.jawRight),
    brow: pick(LM.brow),
    chinLeft: pick(LM.chinLeft),
    chinRight: pick(LM.chinRight)
  };
  return Object.values(anchors).every(Boolean) ? anchors : null;
}

/** Angle ABC in degrees. */
export function angleAt(a, b, c) {
  const ax = a.x - b.x, ay = a.y - b.y;
  const cx = c.x - b.x, cy = c.y - b.y;
  const dot = ax * cx + ay * cy;
  const mag = Math.hypot(ax, ay) * Math.hypot(cx, cy);
  if (!mag) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
}

/**
 * Turn anchors into comparable measurements.
 * `aspect` = image width / image height, so x distances are corrected to the
 * same unit as y distances before any ratio is taken.
 * `hairlineY` (optional, from the hair segmenter) replaces landmark 10 as the
 * top of the face, which is what "face length" should mean.
 */
export function measureAnchors(anchors, { aspect = 1, hairlineY = null } = {}) {
  const p = (a) => ({ x: a.x * aspect, y: a.y });
  const a = Object.fromEntries(Object.entries(anchors).map(([k, v]) => [k, p(v)]));
  const cheek = dist(a.cheekLeft, a.cheekRight);
  if (!(cheek > 1e-6)) return null;

  const top = hairlineY != null
    ? { x: (a.cheekLeft.x + a.cheekRight.x) / 2, y: Math.min(hairlineY, a.chin.y - 0.05) }
    : { x: (a.forehead.x + a.brow.x) / 2, y: (a.forehead.y + a.brow.y) / 2 };

  const lengthPx = Math.max(1e-6, dist(top, a.chin));
  const leftJaw = angleAt(a.cheekLeft, a.jawLeft, a.chin);
  const rightJaw = angleAt(a.cheekRight, a.jawRight, a.chin);
  const jawAngle = (leftJaw + rightJaw) / 2;

  return {
    length: lengthPx / cheek,
    forehead: dist(a.foreheadLeft, a.foreheadRight) / cheek,
    cheek: 1,
    jaw: dist(a.jawLeft, a.jawRight) / cheek,
    jawAngle,
    chin: dist(a.chinLeft, a.chinRight) / cheek,
    // Raw pixel-ish values, handy for sanity checks and the test page.
    px: {
      length: lengthPx,
      forehead: dist(a.foreheadLeft, a.foreheadRight),
      cheek,
      jaw: dist(a.jawLeft, a.jawRight),
      chin: dist(a.chinLeft, a.chinRight),
      leftJawAngle: leftJaw,
      rightJawAngle: rightJaw
    }
  };
}

/** Measure a full MediaPipe landmark set. */
export function measureLandmarks(landmarks, opts = {}) {
  const anchors = landmarksToAnchors(landmarks);
  if (!anchors) return null;
  return measureAnchors(anchors, opts);
}

/**
 * Robust average of several frames.
 * Median per feature, plus a spread figure so callers can tell whether the
 * scan was stable (a shaky scan should lower confidence, not fake precision).
 */
export function averageMeasurements(frames) {
  const usable = (frames || []).filter((f) => f && KEYS.every((k) => Number.isFinite(f[k])));
  if (!usable.length) return null;
  const median = (values) => {
    const s = [...values].sort((x, y) => x - y);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  const out = {};
  const spread = {};
  for (const key of KEYS) {
    const values = usable.map((f) => f[key]);
    out[key] = median(values);
    // Median absolute deviation (scaled): robust to one bad frame, unlike a
    // standard deviation which one outlier can dominate.
    const centre = out[key];
    const deviations = values.map((v) => Math.abs(v - centre));
    spread[key] = 1.4826 * median(deviations);
  }
  out.frames = usable.length;
  out.spread = spread;
  out.stability = stabilityOf(out, spread);
  return out;
}

/** 0..1, how repeatable the measurements were. */
export function stabilityOf(measurements, spread = measurements?.spread) {
  if (!measurements || !spread) return 0;
  const rel = [
    spread.length / Math.max(0.05, measurements.length),
    spread.forehead / Math.max(0.05, measurements.forehead),
    spread.jaw / Math.max(0.05, measurements.jaw),
    spread.jawAngle / 60
  ];
  const worst = Math.max(...rel);
  return Math.max(0, Math.min(1, 1 - worst * 4));
}

/** Chin shape from the lower chin contour width and the jaw angles. */
export function chinShape(measurements) {
  if (!measurements) return "unknown";
  const chinRatio = measurements.chin;
  const angle = measurements.jawAngle;
  if (chinRatio >= 0.36 && angle <= 118) return "square";
  if (chinRatio <= 0.24 && angle >= 126) return "pointed";
  if (chinRatio >= 0.32) return "broad";
  if (angle >= 134) return "soft";
  return "rounded";
}

/**
 * Calibrated scoring (replaces exp(-14 * distance)).
 *
 * Each prototype feature is compared with a Gaussian whose width is a
 * documented tolerance, so a measurement can be "close" without the score
 * collapsing to 0 or saturating at 1. The final number is a fit quality, not a
 * probability — the UI shows High/Medium/Low instead of a fake percentage.
 */
export function scoreShapes(measurements) {
  if (!measurements) return [];
  return SHAPE_KEYS.map((key) => {
    const proto = PROTOTYPES[key];
    let total = 0, weightSum = 0;
    const parts = {};
    for (const f of KEYS) {
      const w = WEIGHT[f];
      if (!w) continue;
      const diff = (measurements[f] - proto[f]) / TOLERANCE[f];
      const s = Math.exp(-(diff * diff));
      parts[f] = s;
      total += w * s;
      weightSum += w;
    }
    return { key, fit: weightSum ? total / weightSum : 0, parts };
  }).sort((a, b) => b.fit - a.fit);
}

/**
 * Classify with an honest confidence label.
 * @param {object} measurements averaged measurements
 * @param {object} [opts]
 * @param {number} [opts.quality] 0..1 scan quality (framing, light, blur, pose)
 * @param {number} [opts.stability] 0..1 measurement repeatability
 */
export function classify(measurements, { quality = 1, stability = 1 } = {}) {
  if (!measurements) {
    return { shape: null, confidence: "low", reason: "no-measurements", ranking: [] };
  }
  const ranking = scoreShapes(measurements);
  const [best, second] = ranking;
  const margin = best.fit - (second ? second.fit : 0);
  const overall = best.fit * (0.55 + 0.45 * quality) * (0.7 + 0.3 * stability);

  let confidence = "low";
  // Thresholds tuned so a clear prototype is "high" while a measurement that
  // sits between two prototypes (a genuinely ambiguous face) drops to medium.
  if (overall >= 0.74 && margin >= 0.2 && quality >= 0.6) confidence = "high";
  else if (overall >= 0.52 && quality >= 0.45) confidence = "medium";

  return {
    shape: best.key,
    confidence,
    overall,
    margin,
    fit: best.fit,
    chin: chinShape(measurements),
    ranking: ranking.map((r) => ({
      key: r.key,
      // Rounded only for debugging/labels; never shown as a precise percentage.
      fit: Math.round(r.fit * 100) / 100
    })),
    reason: confidence === "low" ? "uncertain" : "ok"
  };
}

/**
 * Estimate the real hairline from an ImageSegmenter hair mask.
 * The hair model outputs category 1 for hair. We look at the columns above the
 * face and take the lowest confident hair boundary near the centre of the
 * forehead, which is the hairline instead of mesh vertex 10.
 *
 * @param {{data:Uint8Array,width:number,height:number}} mask category mask
 * @param {{left:number,right:number,top:number,bottom:number}} faceBox normalized
 * @returns {number|null} hairline y in normalized image coordinates
 */
export function hairlineFromMask(mask, faceBox) {
  if (!mask || !mask.data || !mask.width || !mask.height || !faceBox) return null;
  const { data, width, height } = mask;
  const centre = (faceBox.left + faceBox.right) / 2;
  const half = (faceBox.right - faceBox.left) * 0.18;
  const x0 = Math.max(0, Math.floor((centre - half) * width));
  const x1 = Math.min(width - 1, Math.ceil((centre + half) * width));
  const yBottom = Math.min(height - 1, Math.floor((faceBox.top + (faceBox.bottom - faceBox.top) * 0.65) * height));

  // The scalp run starts at the top of the image; the hairline is where hair
  // stops being hair on the way down the forehead. Columns that do not start
  // with hair (cropped tops, hats) are ignored instead of guessed.
  const samples = [];
  for (let x = x0; x <= x1; x += 1) {
    let y = 0;
    while (y < height && data[y * width + x] !== 1) y += 1;
    if (y >= height || y > height * 0.2) continue;
    while (y < yBottom && data[y * width + x] === 1) y += 1;
    if (y > 0 && y < yBottom) samples.push(y / height);
  }
  if (samples.length < 3) return null;
  samples.sort((a, b) => a - b);
  const mid = samples.length >> 1;
  return samples.length % 2 ? samples[mid] : (samples[mid - 1] + samples[mid]) / 2;
}

/** Face box in normalized coordinates from landmarks. */
export function faceBoxFromLandmarks(landmarks) {
  if (!Array.isArray(landmarks) || !landmarks.length) return null;
  let left = 1, right = 0, top = 1, bottom = 0;
  for (const p of landmarks) {
    if (p.x < left) left = p.x;
    if (p.x > right) right = p.x;
    if (p.y < top) top = p.y;
    if (p.y > bottom) bottom = p.y;
  }
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

/**
 * Synthetic landmark sets used by the test page and unit tests.
 * Builds a plausible 468-point array with the eight anchor points placed from
 * documented proportions; everything else is interpolated filler so the array
 * length matches MediaPipe output.
 */
export function syntheticLandmarks({ length = 1.42, forehead = 0.88, jaw = 0.76, jawAngle = 128, chin = 0.30, aspect = 1 } = {}) {
  const cx = 0.5;
  const cheekHalf = 0.12 / aspect; // cheek width 0.24 in y-units
  const chinY = 0.78;
  const cheekY = 0.52;
  const lengthPx = length * 0.24; // cheek width is 0.24
  const topY = chinY - lengthPx;
  const foreheadHalf = (forehead * 0.24) / 2 / aspect;
  const jawHalf = (jaw * 0.24) / 2 / aspect;
  const chinHalf = (chin * 0.24) / 2 / aspect;
  // Move the jaw corners down for sharper jaw angles.
  const jawY = cheekY + (0.1 - (jawAngle - 128) / 900);

  const lm = Array.from({ length: 478 }, (_, i) => ({ x: cx, y: 0.5, z: 0 }));
  const set = (i, x, y) => { lm[i] = { x, y, z: 0 }; };
  set(LM.forehead, cx, topY);
  set(LM.brow, cx, topY + 0.08);
  set(LM.chin, cx, chinY);
  set(LM.foreheadLeft, cx - foreheadHalf, topY + 0.04);
  set(LM.foreheadRight, cx + foreheadHalf, topY + 0.04);
  set(LM.cheekLeft, cx - cheekHalf, cheekY);
  set(LM.cheekRight, cx + cheekHalf, cheekY);
  set(LM.jawLeft, cx - jawHalf, jawY);
  set(LM.jawRight, cx + jawHalf, jawY);
  set(LM.chinLeft, cx - chinHalf, chinY - 0.015);
  set(LM.chinRight, cx + chinHalf, chinY - 0.015);
  return lm;
}
