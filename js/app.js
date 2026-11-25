// Cutfit app bootstrap. Wires the tabs, the scan, the AI try-on, the 3D tab,
// the library, the roulette, barbers and the guide together.
//
// Safety rules used throughout:
//   * every user-visible string goes through textContent or esc();
//   * every network/likely-failing call has try/catch with a friendly message;
//   * unfinished features are hidden behind flags from js/flags.js.

import { flag, setFlag, flagSnapshot } from "./flags.js";
import { t, applyToDom, setLang, getLang, LANGS, money } from "./i18n.js";
import * as store from "./store.js";
import * as Catalog from "./catalog.js";
import * as Scan from "./scan.js";
import * as TryOn from "./tryon.js";
import * as Barbers from "./barbers.js";
import { createGuide } from "./guide.js";
import * as FS from "./face-shape.js";

const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const scrollToEl = (el) => el?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });

const state = {
  scan: null,
  sideScan: null,
  frames: [],
  fineTune: false,
  result: null,
  before: null,
  selected: Catalog.CM["Korean two-block"] || Catalog.CUTS[0],
  prefs: {},
  classification: null,
  measurements: null,
  live: null,
  compare: 50,
  seed: null,
  busy: false
};

// ---------------------------------------------------------------- helpers

function setStatus(id, message, kind = "info") {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
}

function categoryLabel(cut) {
  return `${Catalog.ERA[cut[3]] || "Modern"}, ${Catalog.LEN[cut[2]] || "Medium"}. ${cut[5]}`;
}

function card(cut) {
  const fav = store.isFav(cut[0]);
  return `<div class="cd">${Catalog.fig(cut[4])}
    <b>${esc(cut[0])}</b>
    <span>${esc(categoryLabel(cut))}</span>
    <div class="actions">
      <button class="chip" data-preview="${esc(cut[0])}">Try this</button>
      <button class="chip" data-details="${esc(cut[0])}">Details + views</button>
      <button class="chip" data-fav="${esc(cut[0])}" aria-pressed="${fav}">${fav ? "♥ Saved" : "♡ Save"}</button>
      <a class="chip" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent(
        cut[0] + " haircut tutorial step by step barber guide"
      )}">Tutorial</a>
    </div>
  </div>`;
}

// ------------------------------------------------------------ analytics/logs

let lastEvent = 0;
function track(name, props = {}) {
  try {
    // No Worker v3 (yet): /api/event would 404, so stay quiet instead.
    if (!store.apiV3()) return;
    if (performance.now() - lastEvent < 500) return;
    lastEvent = performance.now();
    const body = JSON.stringify({ name: String(name).slice(0, 40), props, lang: getLang() });
    const url = `${store.apiBase()}/api/event`;
    if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    else fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
  } catch {
    /* analytics must never break the app */
  }
}

let lastLog = 0;
function logError(message, extra = {}) {
  try {
    if (!store.apiV3()) return;
    if (performance.now() - lastLog < 5000) return;
    lastLog = performance.now();
    fetch(`${store.apiBase()}/api/log`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "error",
        message: String(message).slice(0, 300),
        where: location.pathname,
        ...extra
      })
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

window.addEventListener("error", (e) => logError(e.message, { source: e.filename, line: e.lineno }));
window.addEventListener("unhandledrejection", (e) => logError(e.reason?.message || String(e.reason), { kind: "promise" }));

// ------------------------------------------------------------------- toasts

function toast(message, ms = 3200) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

// -------------------------------------------------------------------- tabs

function tab(name) {
  const names = ["scan", "lib", "spin", "try", "saved", "bar", "view3d"];
  for (const n of names) {
    const section = $(`p-${n}`);
    if (section) section.hidden = n !== name;
  }
  document.querySelectorAll("#nv button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.t === name)));
  const active = $(`p-${name}`);
  if (active && !reduceMotion()) {
    active.classList.remove("page-enter");
    void active.offsetWidth;
    active.classList.add("page-enter");
  }
  if (name === "saved") renderSaved();
  if (name === "view3d") openViewer();
  scrollTo(0, 0);
  track("tab", { name });
}

// ------------------------------------------------------------------- terms

function openTerms() {
  const el = $("tm");
  if (el) el.hidden = false;
}
function closeTerms() {
  const el = $("tm");
  if (el) el.hidden = true;
}

// ----------------------------------------------------------------- consent

/**
 * Ask before the camera or before an upload. Resolves true when the user has
 * already agreed (this session or previously).
 */
function requireConsent() {
  if (store.hasConsent()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const dlg = $("consent");
    if (!dlg) return resolve(true);
    const accept = $("consentAccept");
    const decline = $("consentDecline");
    const done = (ok) => {
      dlg.hidden = true;
      accept?.removeEventListener("click", onAccept);
      decline?.removeEventListener("click", onDecline);
      if (ok) store.setConsent(true);
      resolve(ok);
    };
    const onAccept = () => done(true);
    const onDecline = () => done(false);
    accept?.addEventListener("click", onAccept);
    decline?.addEventListener("click", onDecline);
    dlg.hidden = false;
    accept?.focus();
    track("consent_shown");
  });
}

// ------------------------------------------------------------- scan: render

function paintScan(result) {
  const canvas = $("cv");
  if (!canvas || !result) return;
  const scale = Math.min(1, 900 / result.canvas.width);
  canvas.width = Math.round(result.canvas.width * scale);
  canvas.height = Math.round(result.canvas.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(result.canvas, 0, 0, canvas.width, canvas.height);
  Scan.drawMesh(ctx, result.landmarks, canvas.width, canvas.height, {
    color: "rgba(255,255,255,.22)",
    ovalColor: "rgba(255,255,255,.9)",
    lineWidth: Math.max(1, canvas.width / 800)
  });
  if (state.fineTune) {
    if (!result.anchors) result.anchors = anchorObject(result.landmarks);
    drawHandles(ctx, result, canvas.width, canvas.height);
  }
}

const HANDLE_KEYS = ["forehead", "chin", "foreheadLeft", "foreheadRight", "cheekLeft", "cheekRight", "jawLeft", "jawRight"];

function drawHandles(ctx, result, w, h) {
  if (!result?.anchors) return;
  ctx.save();
  for (const key of HANDLE_KEYS) {
    const p = result.anchors[key];
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, Math.max(5, w / 110), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(23,23,23,.75)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
  }
  ctx.restore();
}

function applyScan(result, { scroll = true } = {}) {
  state.scan = result;
  state.frames = [result, ...state.frames].slice(0, 8);
  $("s2").hidden = false;
  $("photoStart").hidden = true;
  $("sum").hidden = true;
  $("retake").hidden = false;
  $("clearPhoto").hidden = false;
  paintScan(result);
  renderQuality();
  $("aihint").textContent = result.hairMask
    ? `Hairline measured with the hair segmenter${result.hairlineY != null ? "" : " (fallback to the brow line)"}.`
    : "Hair segmentation was unavailable, so the hairline falls back to the brow line.";
  setStatus("msg", "", "info");
  if (scroll) scrollToEl($("s2"));
  drawBefore();
  track("scan_done", { source: result.source });
}

function renderQuality() {
  const el = $("scanQuality");
  if (!el || !state.scan) return;
  const q = state.scan.quality;
  const label = q.score > 0.75 ? "Good" : q.score > 0.45 ? "Fair" : "Poor";
  el.innerHTML = `<span>${esc(t("scan.quality"))}: <b>${esc(label)}</b></span>
    <span class="quality-bar"><i style="width:${Math.round(q.score * 100)}%"></i></span>
    <span class="mute fine">${state.frames.length} ${esc(t("scan.frames"))}</span>`;
}

// ----------------------------------------------------------------- scanning

async function startCamera() {
  const ok = await requireConsent();
  if (!ok) {
    setStatus("msg", t("scan.consentRequired"), "warn");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("msg", "Live camera is not available here. Use Upload a photo.", "warn");
    $("f2")?.click();
    return;
  }
  const video = $("vd");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    $("cam").hidden = false;
    $("scanLive").hidden = false;
    setStatus("msg", t("scan.guide"), "info");
    if (!flag("scanV2")) {
      $("sn").hidden = false;
      return;
    }
    $("sn").hidden = true;
    const overlay = $("scanOverlay");
    state.live?.stop();
    state.live = Scan.startLiveCamera({
      video,
      overlay,
      onFrame: (frame) => {
        const hint = $("scanHint");
        if (hint) hint.textContent = frame.message;
        const bar = $("scanHold");
        if (bar) bar.style.width = `${Math.round((frame.progress || 0) * 100)}%`;
        if (frame.autoCapture) captureFrame();
      },
      onError: (err) => {
        setStatus("msg", err.message || "The scanner could not start. Try uploading a photo.", "error");
        logError(err.message, { code: err.code });
      }
    });
  } catch (err) {
    const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
    setStatus(
      "msg",
      denied
        ? "Camera access was blocked. You can still upload a photo."
        : "Live camera isn’t available here. Use Upload a photo, or allow camera access and try again.",
      "warn"
    );
    logError(err?.message || "camera", { code: err?.name });
  }
}

function stopCamera() {
  state.live?.stop();
  state.live = null;
  const video = $("vd");
  const stream = video?.srcObject;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (video) video.srcObject = null;
  $("cam").hidden = true;
  $("scanLive").hidden = true;
}

async function captureFrame() {
  const video = $("vd");
  if (!video || !video.videoWidth) return;
  state.live?.stop();
  state.live = null;
  setStatus("msg", t("scan.q.captured"), "info");
  try {
    const canvas = Scan.toWorkingCanvas(video);
    const result = await Scan.analyzeImage(canvas);
    result.source = "camera";
    const stream = video.srcObject;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    $("cam").hidden = true;
    $("scanLive").hidden = true;
    applyScan(result);
  } catch (err) {
    setStatus("msg", err.message || t("scan.q.noFace"), "error");
    logError(err.message, { code: err.code });
  }
}

async function handleFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setStatus("msg", "Please choose an image file.", "warn");
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    setStatus("msg", "That photo is over 12 MB. Choose a smaller image for a faster scan.", "warn");
    return;
  }
  const ok = await requireConsent();
  if (!ok) {
    setStatus("msg", t("scan.consentRequired"), "warn");
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file didn’t open. Try a JPG or PNG photo."));
      i.src = url;
    });
    setStatus("msg", "Analyzing your photo…", "info");
    const result = await Scan.analyzeImage(img);
    if ($("sideUpload")?.checked) state.sideScan = result;
    applyScan(result);
    if (result.quality.issues.length) {
      setStatus("msg", result.quality.message, "warn");
    }
  } catch (err) {
    setStatus("msg", err.message || "We could not read that photo. Try another one.", "error");
    logError(err.message, { code: err.code });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// -------------------------------------------------------------- fine-tune

function currentAnchors() {
  if (!state.scan) return null;
  if (state.scan.anchors) return state.scan.anchors;
  state.scan.anchors = anchorObject(state.scan.landmarks);
  return state.scan.anchors;
}

function anchorObject(landmarks) {
  const map = {
    forehead: FS.LM.forehead, chin: FS.LM.chin, foreheadLeft: FS.LM.foreheadLeft,
    foreheadRight: FS.LM.foreheadRight, cheekLeft: FS.LM.cheekLeft, cheekRight: FS.LM.cheekRight,
    jawLeft: FS.LM.jawLeft, jawRight: FS.LM.jawRight, brow: FS.LM.brow,
    chinLeft: FS.LM.chinLeft, chinRight: FS.LM.chinRight
  };
  const out = {};
  for (const [key, id] of Object.entries(map)) {
    const p = landmarks?.[id];
    if (p) out[key] = { x: p.x, y: p.y, z: p.z || 0 };
  }
  return out;
}

function toggleFineTune(force) {
  state.fineTune = typeof force === "boolean" ? force : !state.fineTune;
  const panel = $("fineTune");
  if (panel) panel.hidden = !state.fineTune;
  const btn = $("finetune");
  btn?.setAttribute("aria-pressed", String(state.fineTune));
  if (state.scan) paintScan(state.scan);
}

function recomputeFromAnchors() {
  const anchors = currentAnchors();
  if (!anchors || !state.scan) return;
  const m = FS.measureAnchors(anchors, {
    aspect: state.scan.canvas.width / state.scan.canvas.height,
    hairlineY: state.scan.hairlineY
  });
  if (m) {
    state.scan.measurements = m;
    state.scan.anchors = anchors;
  }
}

let dragKey = null;
function bindCanvasDrag() {
  const canvas = $("cv");
  if (!canvas) return;
  const toNorm = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  canvas.addEventListener("pointerdown", (e) => {
    if (!state.fineTune) return;
    const p = toNorm(e);
    const anchors = currentAnchors();
    if (!anchors) return;
    let best = null;
    let bestD = 0.06;
    for (const key of HANDLE_KEYS) {
      const a = anchors[key];
      if (!a) continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < bestD) { bestD = d; best = key; }
    }
    dragKey = best;
    if (dragKey) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragKey) return;
    const p = toNorm(e);
    const anchors = currentAnchors();
    anchors[dragKey] = { ...anchors[dragKey], x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) };
    recomputeFromAnchors();
    paintScan(state.scan);
  });
  canvas.addEventListener("pointerup", () => { dragKey = null; });
  canvas.addEventListener("pointercancel", () => { dragKey = null; });
}

// ------------------------------------------------------------ classification

const CONFIDENCE_LABEL = { high: "confidence.high", medium: "confidence.medium", low: "confidence.low" };

function analyzeFace() {
  if (!state.scan) {
    setStatus("msg", "Take or upload a photo first.", "warn");
    return;
  }
  recomputeFromAnchors();
  const frames = state.frames.map((f) => f.measurements).filter(Boolean);
  const averaged = FS.averageMeasurements(frames) || state.scan.measurements;
  if (!averaged) {
    setStatus("msg", t("scan.q.uploadBad"), "error");
    return;
  }
  const stability = averaged.stability ?? 0.7;
  const quality = state.scan.quality.score;
  const verdict = FS.classify(averaged, { quality, stability });
  state.measurements = averaged;
  state.classification = verdict;
  renderSummary(verdict, averaged, quality, stability);
  scrollToEl($("sum"));
  track("analyze", { shape: verdict.shape, confidence: verdict.confidence });
}

function renderSummary(verdict, m, quality, stability) {
  const sum = $("sum");
  const shape = Catalog.SHAPE_COPY[verdict.shape];
  const prefs = state.prefs;
  const confLabel = t(CONFIDENCE_LABEL[verdict.confidence]);
  const lowBanner =
    verdict.confidence === "low"
      ? `<div class="analysis-note warn"><b>${esc(t("confidence.low"))}</b><p>${esc(t("confidence.retry"))}</p></div>`
      : "";

  const pool = (shape?.r || []).map((n) => Catalog.CM[n]).filter((c) => c && Catalog.matchesAudience(c, prefs.audience || "all"));
  const unique = [...new Map(pool.map((c) => [c[0], c])).values()];
  const ranked = unique
    .map((c, i) => ({ c, score: Catalog.styleScore(c, prefs, i) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const chips = [
    prefs.texture && prefs.texture !== "unsure" ? `${Catalog.HAIR_TYPES[prefs.texture]?.label || prefs.texture} hair` : null,
    prefs.density && prefs.density !== "unsure" ? `${prefs.density} density` : null,
    prefs.maintenance === "low" ? "Low maintenance" : prefs.maintenance === "high" ? "Styling-friendly" : "Moderate styling",
    prefs.vibe ? String(prefs.vibe).replace("-", " ") : null
  ].filter(Boolean);

  sum.innerHTML = `
  <div class="analysis-top">
    <div>
      <p class="eyebrow">CUTFIT FACE ANALYSIS</p>
      <h2>${esc(shape?.n || verdict.shape)} face shape</h2>
      <p class="mute fine">Measured from ${m.frames || 1} frame${(m.frames || 1) > 1 ? "s" : ""}, hairline from hair segmentation.</p>
    </div>
    <div class="confidence-ring" data-level="${esc(verdict.confidence)}">
      <b>${esc(verdict.confidence === "high" ? "High" : verdict.confidence === "medium" ? "Medium" : "Low")}</b>
      <small>${esc(t("confidence.medium").split(" ").slice(-1)[0])}</small>
    </div>
  </div>
  ${lowBanner}
  <div class="profile-tags">${chips.map((c) => `<span>${esc(c)}</span>`).join("")}<span>${esc(confLabel)}</span>
    <span>${esc(FS.chinShape(m))} chin</span></div>
  <p class="fine mute">Ratios — length ${m.length.toFixed(2)}× cheekbone width · forehead ${Math.round(m.forehead * 100)}% · jaw ${Math.round(m.jaw * 100)}% · jaw angle ${Math.round(m.jawAngle)}°. Quality ${Math.round(quality * 100)}%, stability ${Math.round(stability * 100)}%.</p>
  <h3 class="result-title">Your best haircut matches</h3>
  <p class="mute fine">Ranked using your measurements, your hair preferences and your routine. Guidance scores, not a medical or AI diagnosis.</p>
  <div class="recommend-list">${ranked
    .map(({ c, score }, i) => {
      const sp = Catalog.barberSpecs(c, prefs);
      return `<article class="recommend-card">
        <div class="recommend-head">${Catalog.fig(c[4])}
          <div class="recommend-copy">
            <span class="rank-label">#${i + 1} MATCH</span>
            <h3>${esc(c[0])}</h3>
            <p>${esc(c[5])}</p>
            <div class="fit-meter"><i style="width:${score}%"></i></div>
            <small>${score}% style match estimate</small>
          </div>
        </div>
        <div class="spec-grid">${Catalog.SPEC_FIELDS.slice(0, 4).map(([k, label]) => `<div><small>${esc(label)}</small><b>${esc(sp[k])}</b></div>`).join("")}</div>
        <p class="upkeep">Upkeep: ${esc(sp.upkeep)}</p>
        <div class="row recommend-actions">
          <button class="btn" data-preview="${esc(c[0])}">Try this look</button>
          <button class="btn alt" data-barber-note="${esc(c[0])}">Barber instructions</button>
          <button class="btn alt" data-card="${esc(c[0])}">Barber card</button>
        </div>
      </article>`;
    })
    .join("")}</div>
  <div class="analysis-note"><b>Face-shape guidance</b><p>${esc(shape?.g || "")} ${esc(shape?.t || "")}</p><p><b>Usually avoid:</b> ${esc(shape?.a || "")}</p></div>
  ${
    prefs.beard
      ? `<div class="analysis-note"><b>Facial-hair note</b><p>Ask your barber to keep cheek and neckline edges balanced with your haircut.</p></div>`
      : ""
  }
  <p class="mute fine">Hair texture and density come from your selections, not from the photo. Your photo never leaves this device unless you press Generate AI.</p>`;
  sum.hidden = false;
}

// --------------------------------------------------------------- try-on view

function drawBefore() {
  const c = $("cmpBefore");
  if (!c) return;
  const src = state.scan?.canvas;
  c.width = 640;
  c.height = src ? Math.round((src.height / src.width) * 640) : 800;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, c.width, c.height);
  if (src) ctx.drawImage(src, 0, 0, c.width, c.height);
  const wrap = $("compare");
  if (wrap && src) wrap.style.aspectRatio = `${c.width} / ${c.height}`;
}

function drawAfter() {
  const c = $("cmpAfter");
  if (!c) return;
  const src = state.result?.canvas;
  c.width = 640;
  c.height = src ? Math.round((src.height / src.width) * 640) : 800;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, c.width, c.height);
  if (src) ctx.drawImage(src, 0, 0, c.width, c.height);
  $("compare")?.classList.toggle("has-result", Boolean(src));
}

function setCompare(value) {
  state.compare = Math.max(0, Math.min(100, Number(value)));
  const wrap = $("compare");
  if (wrap) wrap.style.setProperty("--split", `${state.compare}%`);
  const handle = $("cmpRange");
  if (handle && Number(handle.value) !== state.compare) handle.value = String(state.compare);
}

function updateFitLabel() {
  const cut = state.selected;
  $("fitStyleName").textContent = cut[0];
  $("fitStyleDesc").textContent = cut[5] || "Custom hairstyle preview";
  const save = $("saveTry");
  if (save) save.textContent = store.isFav(cut[0]) ? "♥ Saved" : "♡ Save";
  document.querySelectorAll(".try-card").forEach((b) => {
    const on = b.dataset.style === cut[0];
    b.setAttribute("aria-pressed", String(on));
    b.querySelector(".picked")?.remove();
    if (on) {
      const i = document.createElement("i");
      i.className = "picked";
      i.textContent = "✓";
      b.append(i);
    }
  });
}

function selectStyle(name) {
  state.selected = Catalog.CM[name] || (Catalog.CM[state.selected?.[0]]) || Catalog.CUTS[0];
  state.result = null;
  drawAfter();
  updateFitLabel();
  const style = $("tryStyle");
  if (style) style.value = state.selected[0];
}

function setupTryShelf() {
  const select = $("tryStyle");
  if (select) {
    select.innerHTML = "";
    for (const cut of Catalog.CUTS) {
      if (!Catalog.matchesAudience(cut, "all")) continue;
      const opt = document.createElement("option");
      opt.value = cut[0];
      opt.textContent = cut[0];
      select.append(opt);
    }
    select.value = state.selected[0];
  }
  const featured = [
    "Korean two-block", "Korean comma two-block", "Mid taper with textured top", "Burst fade",
    "Drop fade", "Modern mullet", "Textured fringe", "Modern slick back", "Teddy bear cut",
    "Japanese wolf cut", "Edgar cut", "Bro flow"
  ];
  const items = featured
    .map((n) => Catalog.CUTS.find((c) => c[0].toLowerCase() === n.toLowerCase()))
    .filter(Boolean);
  const carousel = $("tryCarousel");
  if (!carousel) return;
  carousel.innerHTML =
    `<button class="try-card add" type="button" data-open-3d="1"><b class="plus">+</b><span>Create your own</span></button>` +
    items
      .map(
        (c) => `<button class="try-card" type="button" data-style="${esc(c[0])}" aria-pressed="${c[0] === state.selected[0]}">
          ${Catalog.fig(c[4])}<span>${esc(c[0])}</span></button>`
      )
      .join("");
}

// ------------------------------------------------------------------- AI run

function setProgress(step, detail) {
  const bar = $("tryProgressBar");
  const label = $("tryStage");
  const wrap = $("tryProgress");
  if (wrap) wrap.hidden = false;
  const pct = [0, 12, 28, 48, 78, 96][step] ?? 0;
  if (bar) bar.style.width = `${pct}%`;
  if (label) {
    label.textContent = t(`try.progress${Math.min(5, Math.max(1, step))}`);
  }
  if (detail) $("trymsg").textContent = `${t(`try.progress${Math.min(5, Math.max(1, step))}`)} ${detail || ""}`.trim();
}

async function runAI({ seed = null, colour = null, beard = false } = {}) {
  if (!flag("aiV2")) {
    setStatus("trymsg", t("try.disabled"), "warn");
    return;
  }
  if (!store.apiV3()) {
    setStatus("trymsg", t("try.needsDeploy"), "warn");
    return;
  }
  if (!state.scan) {
    setStatus("trymsg", t("try.needPhoto"), "warn");
    tab("scan");
    return;
  }
  const ok = await requireConsent();
  if (!ok) return;
  if (state.busy) return;
  state.busy = true;
  const btn = $("renderTry");
  if (btn) { btn.disabled = true; btn.textContent = "…"; }

  try {
    const specs = Catalog.barberSpecs(state.selected, state.prefs);
    setProgress(1);
    const out = await TryOn.generatePreview({
      scan: state.scan,
      specs,
      cutName: state.selected[0],
      options: {
        seed,
        color: colour || $("hairColor")?.value || "",
        hairType: state.prefs.texture,
        view: state.view || "front"
      },
      onProgress: (step, detail) => setProgress(step, detail)
    });
    state.result = out;
    state.before = state.scan.canvas;
    state.seed = out.seed;
    const seedInput = $("seedInput");
    if (seedInput && out.seed != null) seedInput.value = String(out.seed);
    drawAfter();
    setCompare(50);
    $("compare")?.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
    setStatus("trymsg", t("try.done"), "ok");
    $("tryStage").textContent = t("try.done");
    $("tryProgress")?.setAttribute("hidden", "");
    const credits = store.cachedCredits();
    if (typeof credits === "number") $("tryCredits").textContent = `${credits} AI credits`;
    track("ai_done", { cut: state.selected[0] });
  } catch (err) {
    setStatus("trymsg", err.message || "AI generation failed. Please try again.", "error");
    logError(err.message, { code: err.code, status: err.status });
  } finally {
    state.busy = false;
    if (btn) { btn.disabled = false; btn.textContent = `✦ ${t("try.generate")}`; }
    $("tryProgress")?.setAttribute("hidden", "");
  }
}

// --------------------------------------------------------------- barber card

async function showBarberCard(cutName) {
  const cut = Catalog.CM[cutName] || state.selected;
  const specs = Catalog.barberSpecs(cut, state.prefs);
  const canvas = Barbers.drawBarberCard({
    cutName: cut[0],
    specs,
    shapeLabel: state.classification ? Catalog.SHAPE_COPY[state.classification.shape]?.n : "",
    beforeCanvas: state.before || state.scan?.canvas || null,
    afterCanvas: state.result?.canvas || null,
    shopName: $("barberShopName")?.value || "",
    note: "Estimates only. Cutfit"
  });
  const modal = $("cardModal");
  const img = $("cardPreview");
  if (img) {
    img.src = canvas.toDataURL("image/png");
    img.width = 620;
    img.height = Math.round((canvas.height / canvas.width) * 620);
  }
  if (modal) modal.hidden = false;
  const dl = $("cardDownload");
  if (dl) dl.onclick = () => Barbers.downloadCanvas(canvas, `cutfit-${cut[0].toLowerCase().replace(/[^a-z0-9]+/g, "-")}-barber-card.png`);
  const pr = $("cardPrint");
  if (pr) pr.onclick = () => Barbers.printCard(canvas);
  const sh = $("cardShare");
  if (sh) sh.onclick = async () => {
    const res = await TryOn.shareCanvases(canvas, `${cut[0]} — my Cutfit barber card`);
    toast(res === "shared" ? t("share.copied") : res === "downloaded" ? t("share.unsupported") : "");
  };
  track("barber_card", { cut: cut[0] });
}

// --------------------------------------------------------------- library

let libraryPage = 1;
let libraryTotal = 0;

function renderLibrary() {
  const q = ($("styleSearch")?.value || "").trim().toLowerCase();
  const len = $("styleLength")?.value || "a";
  const era = $("styleEra")?.value || "a";
  const type = $("styleType")?.value || "a";
  const audience = $("styleAudience")?.value || "all";
  const hair = $("styleHair")?.value || "all";
  const terms = {
    fade: /fade|taper|undercut|bald/,
    fringe: /fringe|curtain|bang|crop|caesar|comma/,
    curl: /curl|afro|wave|shag|wolf|texture|perm/,
    long: /long|layer|lob|bob|shag|wolf/,
    classic: /pompadour|ducktail|crew|ivy|side part|slick|flat top|buzz|beehive|bob/,
    korean: /korean|comma|two.block|hush|teddy/,
    natural: /afro|coily|curl|braid|natural|perm/
  };
  const list = Catalog.CUTS.filter(
    (c) =>
      Catalog.matchesAudience(c, audience) &&
      (era === "a" || c[3] === era) &&
      (len === "a" || c[2] === len) &&
      (type === "a" || terms[type]?.test(c[0].toLowerCase())) &&
      (hair === "all" || Catalog.hairTypeMatch(c, hair) > 0.5) &&
      (!q || `${c[0]} ${c[5]} ${Catalog.ERA[c[3]]} ${Catalog.LEN[c[2]]}`.toLowerCase().includes(q))
  );
  libraryTotal = list.length;
  const pages = Math.max(1, Math.ceil(list.length / 12));
  libraryPage = Math.min(libraryPage, pages);
  const shown = list.slice((libraryPage - 1) * 12, libraryPage * 12);
  const el = $("ll");
  if (!el) return;
  el.innerHTML = `
    <div class="library-count">
      <p class="mute fine">${list.length} ${list.length === 1 ? "cut" : "cuts"} found${q ? ` for “${esc(q)}”` : ""}</p>
      <p class="mute fine">Page ${libraryPage} of ${pages}</p>
    </div>
    <div class="gr">${shown.map(card).join("") || '<p class="mute">No cuts found. Try a different search or filter.</p>'}</div>
    <div class="library-pagination">
      <button data-page="prev" ${libraryPage === 1 ? "disabled" : ""} aria-label="Previous page">‹</button>
      ${Array.from({ length: pages }, (_, i) => i + 1)
        .slice(Math.max(0, libraryPage - 3), Math.max(0, libraryPage - 3) + 5)
        .map((n) => `<button data-page="${n}" aria-current="${n === libraryPage ? "page" : "false"}">${n}</button>`)
        .join("")}
      <button data-page="next" ${libraryPage === pages ? "disabled" : ""} aria-label="Next page">›</button>
    </div>`;
}

function renderSaved() {
  const el = $("savedList");
  if (!el) return;
  const names = [...new Set([...store.getFavs(), ...store.getCustoms().map((r) => r.name)])];
  const items = names.map((n) => Catalog.CM[n]).filter(Boolean);
  if (!items.length) {
    el.innerHTML = `<div class="hint"><b>Your shelf is empty—for now.</b><p>Save a hairstyle from the Style Library or the fitting room and it will appear here.</p><button class="btn" data-t="lib">Explore hairstyles</button></div>`;
    return;
  }
  el.innerHTML = `<p class="mute fine">${items.length} saved ${items.length === 1 ? "style" : "styles"}</p>
    <div class="gr">${items
      .map(
        (c) => `<div class="cd">${Catalog.fig(c[4])}<b>${esc(c[0])}</b><span>${esc(categoryLabel(c))}</span>
        <div class="actions">
          <button class="chip" data-preview="${esc(c[0])}">Open in try-on</button>
          <button class="chip" data-fav="${esc(c[0])}" aria-pressed="true">Remove ♥</button>
        </div></div>`
      )
      .join("")}</div>`;
}

// --------------------------------------------------------------- roulette

let wheelPool = [];
let wheelRotation = 0;
let wheelBusy = false;

function buildWheel() {
  const pool = Catalog.CUTS.filter((c) => c[1] === "m" || c[1] === "u");
  wheelPool = [...pool].sort(() => Math.random() - 0.5).slice(0, 12);
  const count = $("wheelCount");
  if (count) count.textContent = `${pool.length} eligible hairstyles in this challenge`;
  const disk = $("wd");
  if (!disk) return;
  disk.style.transition = "none";
  disk.style.transform = "rotate(0deg)";
  wheelRotation = 0;
  const slice = 30;
  const point = (r, deg) => [(r * Math.cos((deg * Math.PI) / 180)).toFixed(1), (r * Math.sin((deg * Math.PI) / 180)).toFixed(1)];
  disk.innerHTML =
    '<svg viewBox="-102 -102 204 204" style="display:block;width:100%" role="img" aria-label="Cut roulette wheel">' +
    wheelPool
      .map((c, i) => {
        const start = -90 + i * slice;
        const [x0, y0] = point(100, start);
        const [x1, y1] = point(100, start + slice);
        return `<path d="M0 0L${x0} ${y0}A100 100 0 0 1 ${x1} ${y1}Z" fill="${i % 2 ? "var(--card)" : "var(--sk)"}" stroke="var(--bg)" stroke-width="1.5"/>
        <text transform="rotate(${start + slice / 2}) translate(96 0)" text-anchor="end" dominant-baseline="middle" font-size="8" fill="var(--ink)">${esc(c[0])}</text>`;
      })
      .join("") +
    "</svg>";
}

function spinWheel() {
  if (wheelBusy || !wheelPool.length) return;
  wheelBusy = true;
  const result = $("wr");
  if (result) result.textContent = "";
  const index = Math.floor(Math.random() * wheelPool.length);
  const slice = 360 / wheelPool.length;
  const disk = $("wd");
  wheelRotation = Math.ceil(wheelRotation / 360) * 360 + 1800 - (index + 0.5) * slice + (Math.random() - 0.5) * slice * 0.6;
  if (disk) {
    disk.style.transition = reduceMotion() ? "none" : "transform 4.2s cubic-bezier(.12,.7,.15,1)";
    disk.style.transform = `rotate(${wheelRotation}deg)`;
  }
  setTimeout(
    () => {
      wheelBusy = false;
      const cut = wheelPool[index];
      const quip = ["Hope your barber is ready.", "No take-backs.", "Confidence required.", "Bold choice. We’re rooting for you."][
        Math.floor(Math.random() * 4)
      ];
      if (result) {
        result.innerHTML = `<div class="cd" style="max-width:220px;margin:18px auto 8px;text-align:center">${Catalog.fig(
          cut[4]
        )}<b>${esc(cut[0])}</b><span>${esc(categoryLabel(cut))}</span></div>
        <p style="text-align:center">${esc(cut[0])}! ${esc(quip)}</p>
        <div class="row" style="justify-content:center"><button class="btn alt" data-t="bar">Find a barber</button></div>`;
      }
      track("roulette", { cut: cut[0] });
    },
    reduceMotion() ? 60 : 4300
  );
}

// ------------------------------------------------------------------ 3D view

let viewerApi = null;
let viewerLoading = false;

async function openViewer() {
  if (!flag("viewer3d")) {
    const off = $("viewerOff");
    if (off) off.hidden = false;
    return;
  }
  if (viewerApi || viewerLoading) return;
  const canvas = $("stcv");
  if (!canvas) return;
  if (!state.scan) {
    setStatus("stmsg", t("viewer.noPhoto"), "warn");
    return;
  }
  viewerLoading = true;
  setStatus("stmsg", t("viewer.loading"), "info");
  try {
    const mod = await import("./viewer3d.js");
    const manifest = await mod.loadHairManifest();
    const style = manifest.styles.find((s) => s.builtin) || manifest.styles[0] || null;
    const created = await mod.createViewer({ canvas, scan: state.scan, hairStyle: style, onStatus: (m) => setStatus("stmsg", m, "info") });
    if (!created.ok) {
      setStatus("stmsg", created.reason === "weak" ? t("viewer.weak") : t("viewer.noWebGL"), "warn");
      $("viewerFallback").hidden = false;
      return;
    }
    viewerApi = created.api;
    const notice = $("hairNotice");
    if (notice) {
      notice.hidden = false;
      notice.textContent = created.api.info?.loaded
        ? `Hair asset: ${created.api.info.name || ""} (${created.api.info.license || "license not recorded"})`
        : t("viewer.hairMissing");
    }
    const select = $("hairStyle");
    if (select) {
      select.innerHTML = manifest.styles
        .map((s, i) => `<option value="${i}">${esc(s.name || s.id)}${s.file ? "" : " (example cards)"}</option>`)
        .join("");
      select.onchange = () => {
        const s = manifest.styles[Number(select.value)];
        viewerApi.setHair(s);
      };
    }
    setStatus("stmsg", "Drag to rotate. Presets, length, fade, colour and lighting are below.", "info");
    track("viewer_open", { styles: manifest.styles.length });
  } catch (err) {
    setStatus("stmsg", err.message || "The 3D viewer could not start on this device.", "error");
    $("viewerFallback").hidden = false;
    logError(err.message, { where: "viewer3d" });
  } finally {
    viewerLoading = false;
  }
}

function bindViewerControls() {
  $("lengthRange")?.addEventListener("input", (e) => {
    viewerApi?.setLength(Number(e.target.value) / 100);
    const label = $("lengthValue");
    if (label) label.textContent = `${e.target.value}%`;
  });
  $("fadeRange")?.addEventListener("input", (e) => {
    viewerApi?.setFade(Number(e.target.value) / 100);
    const label = $("fadeValue");
    if (label) label.textContent = `${e.target.value}%`;
  });
  $("viewerColor")?.addEventListener("input", (e) => viewerApi?.setColor(e.target.value));
  $("lightingPreset")?.addEventListener("change", (e) => viewerApi?.setLighting(e.target.value));
  document.querySelectorAll("[data-view]").forEach((b) =>
    b.addEventListener("click", () => viewerApi?.view(b.dataset.view))
  );
  $("snapshot")?.addEventListener("click", () => {
    try {
      const url = viewerApi?.snapshot();
      if (!url) return;
      const a = document.createElement("a");
      a.href = url;
      a.download = "cutfit-3d-look.png";
      a.click();
    } catch {
      toast("Could not save the snapshot on this device.");
    }
  });
}

// ------------------------------------------------------------------ consents

function openPrivacy() {
  location.href = "privacy.html";
}

function deletePhotos() {
  stopCamera();
  state.scan = null;
  state.sideScan = null;
  state.result = null;
  state.before = null;
  state.frames = [];
  state.classification = null;
  store.deletePhotos();
  $("s2").hidden = true;
  $("photoStart").hidden = false;
  $("sum").hidden = true;
  $("retake").hidden = true;
  $("clearPhoto").hidden = true;
  drawBefore();
  drawAfter();
  toast(t("consent.deleted"));
  track("photos_deleted");
}

// ------------------------------------------------------------------- debug

function buildDebugPanel() {
  const panel = $("debugPanel");
  if (!panel) return;
  const snap = flagSnapshot();
  panel.innerHTML = `<h3>Feature flags</h3>${Object.entries(snap)
    .map(
      ([k, v]) => `<label class="debug-row"><input type="checkbox" data-flag="${esc(k)}" ${v ? "checked" : ""}> ${esc(k)}</label>`
    )
    .join("")}<p class="fine mute">Flags are stored on this device. Use ?flags=scanV2:0 to share a link with a feature off.</p>
    <button class="chip" id="debugClose">${esc(t("common.close"))}</button>`;
  panel.querySelectorAll("[data-flag]").forEach((input) =>
    input.addEventListener("change", () => setFlag(input.dataset.flag, input.checked))
  );
  $("debugClose")?.addEventListener("click", () => { panel.hidden = true; location.reload(); });
  panel.hidden = false;
}

// -------------------------------------------------------------------- boot

function bindNav() {
  document.querySelectorAll("#nv button").forEach((b) => b.addEventListener("click", () => tab(b.dataset.t)));
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-t],[data-go]");
    if (go) {
      const name = go.dataset.t || go.dataset.go;
      if (name) tab(name);
    }
  });
}

function bindHeader() {
  document.querySelectorAll("[data-lang-pick]").forEach((b) =>
    b.addEventListener("click", () => {
      setLang(b.dataset.langPick);
      renderLibrary();
      renderSaved();
    })
  );
  $("logoBtn")?.addEventListener("click", () => tab("scan"));
  // Hidden debug: ?debug=1, or five quick taps on the logo.
  let taps = 0;
  let tapTimer = 0;
  $("logoBtn")?.addEventListener("pointerdown", () => {
    taps += 1;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { taps = 0; }, 1200);
    if (taps >= 5) { taps = 0; buildDebugPanel(); }
  });
  if (new URLSearchParams(location.search).get("debug") === "1") buildDebugPanel();
}

function bindScanUI() {
  $("b1")?.addEventListener("click", startCamera);
  $("liveStart")?.addEventListener("click", startCamera);
  $("b2")?.addEventListener("click", async () => {
    if (!(await requireConsent())) return;
    $("f2")?.click();
  });
  $("sn")?.addEventListener("click", captureFrame);
  $("cc")?.addEventListener("click", stopCamera);
  $("liveStop")?.addEventListener("click", stopCamera);
  $("retake")?.addEventListener("click", () => {
    stopCamera();
    state.scan = null;
    state.frames = [];
    state.classification = null;
    $("s2").hidden = true;
    $("sum").hidden = true;
    $("photoStart").hidden = false;
    $("cam").hidden = true;
    drawBefore();
    drawAfter();
    setStatus("msg", t("scan.status"), "info");
  });
  $("clearPhoto")?.addEventListener("click", deletePhotos);
  $("f1")?.addEventListener("change", (e) => { const f = e.target.files?.[0]; e.target.value = ""; handleFile(f); });
  $("f2")?.addEventListener("change", (e) => { const f = e.target.files?.[0]; e.target.value = ""; handleFile(f); });
  $("auto")?.addEventListener("click", async () => {
    if (!state.scan) return;
    try {
      $("auto").disabled = true;
      const result = await Scan.analyzeImage(state.scan.canvas);
      state.frames = [result];
      applyScan(result, { scroll: false });
    } catch (err) {
      setStatus("msg", err.message || t("scan.q.noFace"), "error");
    } finally {
      $("auto").disabled = false;
    }
  });
  $("rs")?.addEventListener("click", () => {
    if (!state.scan) return;
    state.scan.anchors = anchorObject(state.scan.landmarks);
    recomputeFromAnchors();
    paintScan(state.scan);
  });
  $("finetune")?.addEventListener("click", () => toggleFineTune());
  $("go")?.addEventListener("click", analyzeFace);
  bindCanvasDrag();

  const prefs = () => ({
    texture: $("hairTexture")?.value || "unsure",
    density: $("hairDensity")?.value || "medium",
    maintenance: $("maintenance")?.value || "medium",
    vibe: $("vibe")?.value || "trendy",
    length: $("lengthPref")?.value || "any",
    fringe: $("fringePref")?.value || "open",
    audience: $("audiencePref")?.value || "all",
    beard: Boolean($("beardPref")?.checked)
  });
  for (const id of ["hairTexture", "hairDensity", "maintenance", "vibe", "lengthPref", "fringePref", "audiencePref", "beardPref"]) {
    $(id)?.addEventListener("change", () => {
      state.prefs = prefs();
      if (state.classification) renderSummary(state.classification, state.measurements, state.scan.quality.score, state.measurements.stability || 0.7);
    });
  }
  state.prefs = prefs();
}

function bindLibraryUI() {
  ["styleSearch", "styleLength", "styleEra", "styleType", "styleAudience", "styleHair"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener(id === "styleSearch" ? "input" : "change", () => {
      libraryPage = 1;
      renderLibrary();
    });
  });
  $("barberSearch")?.addEventListener("input", (e) =>
    Barbers.renderBarbers($("bl"), { query: e.target.value, reviews: store.getReviews() })
  );
}

function bindTryUI() {
  const seed = $("seedInput");
  $("renderTry")?.addEventListener("click", () => runAI({ seed: seed?.value ? Number(seed.value) : null }));
  $("regenerate")?.addEventListener("click", () => {
    const next = Math.floor(Math.random() * 2 ** 31);
    if (seed) seed.value = String(next);
    runAI({ seed: next });
  });
  $("cmpRange")?.addEventListener("input", (e) => setCompare(e.target.value));
  $("hairColor")?.addEventListener("change", (e) => {
    const name = e.target.options[e.target.selectedIndex]?.textContent || "a new colour";
    if (!state.result) {
      setStatus("trymsg", "Generate a preview first, then you can change the colour.", "warn");
      return;
    }
    (async () => {
      try {
        setStatus("trymsg", "Changing the hair colour…", "info");
        const out = await TryOn.recolour({ scan: state.scan, previous: state.result.canvas, colorName: name, seed: state.seed });
        state.result = { ...state.result, canvas: out.canvas };
        drawAfter();
      } catch (err) {
        setStatus("trymsg", err.message, "error");
      }
    })();
  });
  $("beardBtn")?.addEventListener("click", async () => {
    if (!state.result) {
      setStatus("trymsg", "Generate a haircut preview first.", "warn");
      return;
    }
    try {
      setStatus("trymsg", "Neatening the beard…", "info");
      const out = await TryOn.restyleBeard({ scan: state.scan, previous: state.result.canvas, seed: state.seed });
      state.result = { ...state.result, canvas: out.canvas };
      drawAfter();
      setStatus("trymsg", "Beard preview updated.", "ok");
    } catch (err) {
      setStatus("trymsg", err.message, "error");
    }
  });
  $("shareTry")?.addEventListener("click", async () => {
    if (!state.result?.canvas || !state.before) return setStatus("trymsg", "Generate a preview first.", "warn");
    try {
      const pair = await TryOn.makePair(state.before, state.result.canvas, state.selected[0]);
      const res = await TryOn.shareCanvases(pair, `${state.selected[0]} — my Cutfit preview`);
      if (res === "downloaded") toast(t("share.unsupported"));
    } catch (err) {
      setStatus("trymsg", err.message, "error");
    }
  });
  $("saveTry")?.addEventListener("click", () => {
    const saved = store.toggleFav(state.selected[0]);
    updateFitLabel();
    renderSaved();
    toast(saved ? `${state.selected[0]} saved.` : `${state.selected[0]} removed.`);
  });
  $("saveTrySecondary")?.addEventListener("click", () => {
    if (!state.result?.canvas) {
      setStatus("trymsg", "Generate a preview first, then you can save it.", "warn");
      return;
    }
    const a = document.createElement("a");
    a.download = `cutfit-${state.selected[0].toLowerCase().replace(/[^a-z0-9]+/g, "-")}-preview.png`;
    a.href = state.result.canvas.toDataURL("image/png");
    a.click();
    setStatus("trymsg", "Preview downloaded.", "ok");
  });
  $("cardFromTry")?.addEventListener("click", () => showBarberCard(state.selected[0]));
  $("tutorialFit")?.addEventListener("click", () =>
    window.open(
      "https://www.youtube.com/results?search_query=" + encodeURIComponent(state.selected[0] + " men haircut tutorial barber step by step"),
      "_blank",
      "noopener"
    )
  );
  $("adjustFit")?.addEventListener("click", () => {
    const panel = $("fitAdjustments");
    if (panel) panel.hidden = !panel.hidden;
  });
  $("colorFit")?.addEventListener("click", () => {
    const panel = $("fitAdjustments");
    if (panel) panel.hidden = false;
    $("hairColor")?.focus();
  });
  document.querySelectorAll("[data-view-tab]").forEach((b) =>
    b.addEventListener("click", async () => {
      const view = b.dataset.viewTab;
      document.querySelectorAll("[data-view-tab]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      const tag = $("viewTag");
      if (tag) tag.textContent = `${view.toUpperCase()} VIEW`;
      if (view === "front") {
        state.view = "front";
        return;
      }
      if (view !== "front" && !state.sideScan) {
        setStatus("trymsg", t("try.needSide"), "warn");
        return;
      }
      state.view = view;
      setStatus("trymsg", `${t("try.side")} view uses your second photo.`, "info");
    })
  );
}

function bindBarbersUI() {
  Barbers.renderBarbers($("bl"), { reviews: store.getReviews() });
  document.addEventListener("click", (e) => {
    const rv = e.target.closest("[data-rv]");
    if (rv) {
      const row = $("rf" + rv.dataset.rv);
      if (row) row.hidden = !row.hidden;
      return;
    }
    const sv = e.target.closest("[data-sv]");
    if (sv) {
      const i = Number(sv.dataset.sv);
      const shop = Barbers.BARBERS[i];
      store.addReview(shop[8], { s: $("rs" + i)?.value, t: $("rt" + i)?.value });
      Barbers.renderBarbers($("bl"), { query: $("barberSearch")?.value || "", reviews: store.getReviews() });
    }
  });
}

function bindDocumentClicks() {
  document.addEventListener("click", async (e) => {
    const preview = e.target.closest("[data-preview]");
    if (preview) {
      selectStyle(preview.dataset.preview);
      tab("try");
      return;
    }
    const details = e.target.closest("[data-details]");
    if (details) {
      showDetails(details.dataset.details);
      return;
    }
    const fav = e.target.closest("[data-fav]");
    if (fav) {
      store.toggleFav(fav.dataset.fav);
      renderLibrary();
      renderSaved();
      updateFitLabel();
      return;
    }
    const note = e.target.closest("[data-barber-note]");
    if (note) {
      const cut = Catalog.CM[note.dataset.barberNote];
      const text = Barbers.barberNote({
        cutName: cut[0],
        specs: Catalog.barberSpecs(cut, state.prefs),
        shapeLabel: state.classification ? Catalog.SHAPE_COPY[state.classification.shape]?.n : "",
        shopName: $("barberShopName")?.value || ""
      });
      try {
        await navigator.clipboard.writeText(text);
        toast("Barber instructions copied!");
      } catch {
        toast("Copy was blocked. Select the specs on the card instead.");
      }
      return;
    }
    const cardBtn = e.target.closest("[data-card]");
    if (cardBtn) {
      showBarberCard(cardBtn.dataset.card);
      return;
    }
    const page = e.target.closest("[data-page]");
    if (page) {
      const pages = Math.max(1, Math.ceil(libraryTotal / 12));
      const value = page.dataset.page;
      libraryPage = value === "next" ? Math.min(pages, libraryPage + 1) : value === "prev" ? Math.max(1, libraryPage - 1) : Math.min(pages, Number(value));
      renderLibrary();
      scrollToEl($("p-lib"));
      return;
    }
    const styleBtn = e.target.closest("[data-style]");
    if (styleBtn) {
      selectStyle(styleBtn.dataset.style);
      return;
    }
    const open3d = e.target.closest("[data-open-3d]");
    if (open3d) {
      tab("view3d");
    }
  });
}

function showDetails(name) {
  const cut = Catalog.CM[name];
  if (!cut) return;
  const specs = Catalog.barberSpecs(cut, state.prefs);
  $("haircutTitle").textContent = cut[0];
  $("haircutDescription").textContent = cut[5] || "Modern haircut reference";
  $("haircutSpecs").innerHTML = Catalog.SPEC_FIELDS.map(
    ([k, label]) => `<div><small>${esc(label)}</small><b>${esc(specs[k])}</b></div>`
  ).join("");
  $("haircutViews").innerHTML = [
    ["Front", "front view"],
    ["Side", "side profile view"],
    ["Back", "back view"]
  ]
    .map(
      ([label, view]) =>
        `<a class="view-link" target="_blank" rel="noopener" href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
          cut[0] + " haircut " + view
        )}"><b>${esc(label)} view ↗</b><small>Open photo references</small></a>`
    )
    .join("");
  $("haircutVideo").href =
    "https://www.youtube.com/results?search_query=" + encodeURIComponent(cut[0] + " haircut real life transformation barber tutorial");
  $("useHaircut").dataset.style = cut[0];
  $("haircutModal").hidden = false;
}

function bindModals() {
  $("closeHaircut")?.addEventListener("click", () => { $("haircutModal").hidden = true; });
  $("haircutModal")?.addEventListener("click", (e) => { if (e.target === $("haircutModal")) $("haircutModal").hidden = true; });
  $("useHaircut")?.addEventListener("click", () => {
    selectStyle($("useHaircut").dataset.style);
    $("haircutModal").hidden = true;
    tab("try");
  });
  $("cardClose")?.addEventListener("click", () => { $("cardModal").hidden = true; });
  $("cardModal")?.addEventListener("click", (e) => { if (e.target === $("cardModal")) $("cardModal").hidden = true; });
  $("tl")?.addEventListener("click", openTerms);
  $("ag")?.addEventListener("click", () => {
    store.setConsent(true);
    closeTerms();
  });
  $("dc")?.addEventListener("click", () => {
    closeTerms();
    setStatus("msg", "Agree to the terms to use the camera or photo upload.", "warn");
  });
  $("privacyLink")?.addEventListener("click", openPrivacy);
  $("deletePhotos")?.addEventListener("click", deletePhotos);
  $("deletePhotosFooter")?.addEventListener("click", deletePhotos);
  $("guideOpen")?.addEventListener("click", () => {
    const bot = $("bot");
    if (!bot) return;
    bot.hidden = !bot.hidden;
    if (!bot.hidden) guide.suggest();
  });
  $("guideClose")?.addEventListener("click", () => { $("bot").hidden = true; });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if ($("haircutModal") && !$("haircutModal").hidden) $("haircutModal").hidden = true;
      else if ($("cardModal") && !$("cardModal").hidden) $("cardModal").hidden = true;
      else if ($("tm") && !$("tm").hidden) closeTerms();
      else if ($("consent") && !$("consent").hidden) $("consent").hidden = true;
      else if ($("bot") && !$("bot").hidden) $("bot").hidden = true;
    }
  });
}

function bindInstall() {
  let prompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    prompt = e;
    const btn = $("installBtn");
    if (btn) btn.hidden = false;
  });
  $("installBtn")?.addEventListener("click", async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    prompt = null;
    $("installBtn").hidden = true;
  });
  $("offlineChip") && (document.body.dataset.online = navigator.onLine ? "1" : "0");
  window.addEventListener("offline", () => {
    document.body.dataset.online = "0";
    const chip = $("offlineChip");
    if (chip) { chip.hidden = false; chip.textContent = t("common.offline"); }
  });
  window.addEventListener("online", () => {
    document.body.dataset.online = "1";
    const chip = $("offlineChip");
    if (chip) chip.hidden = true;
  });
}

async function refreshCredits() {
  if (!store.apiV3()) {
    const el = $("tryCredits");
    if (el) el.textContent = "AI credits: —";
    return;
  }
  try {
    const data = await store.api("/api/credits", { timeoutMs: 8000 });
    if (typeof data.credits === "number") {
      store.setCachedCredits(data.credits);
      const el = $("tryCredits");
      if (el) el.textContent = `${data.credits}/${data.max ?? 10} AI credits`;
      const btn = $("renderTry");
      if (btn) btn.disabled = data.credits <= 0;
    }
  } catch {
    const cached = store.cachedCredits();
    const el = $("tryCredits");
    if (el) el.textContent = cached == null ? "AI credits: —" : `${cached} AI credits`;
  }
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

let guide = null;

async function boot() {
  applyToDom();
  bindNav();
  bindHeader();
  bindScanUI();
  bindLibraryUI();
  bindTryUI();
  bindBarbersUI();
  bindDocumentClicks();
  bindModals();
  bindInstall();
  bindViewerControls();
  setupTryShelf();
  renderLibrary();
  renderSaved();
  buildWheel();
  drawBefore();
  drawAfter();
  setCompare(50);
  updateFitLabel();
  registerSW();

  guide = createGuide({
    log: $("ms"),
    chips: $("qc"),
    input: $("bi"),
    send: $("bs"),
    onTerms: openTerms
  });
  $("cb")?.addEventListener("click", () => {
    const bot = $("bot");
    if (!bot) return;
    bot.hidden = !bot.hidden;
    if (!bot.hidden && $("ms") && !$("ms").children.length) {
      guide.say("Hi! I’m the Cutfit guide. Ask me about scanning, face shapes, the 3D viewer, barbers or privacy.");
      guide.suggest();
    }
  });
  $("sp")?.addEventListener("click", spinWheel);
  $("sf")?.addEventListener("click", buildWheel);

  // Hide gated UI instead of showing broken controls.
  for (const id of ["liveStart", "tryGenerateWrap"]) {
    const el = $(id);
    if (el && !flag("scanV2")) el.hidden = true;
  }
  if (!flag("aiV2")) {
    const wrap = $("tryAI");
    if (wrap) {
      wrap.hidden = false;
      wrap.textContent = t("try.disabled");
    }
  }
  if (!flag("viewer3d")) {
    const btn = document.querySelector('[data-t="view3d"]');
    if (btn) btn.hidden = true;
  }

  if (!store.hasConsent()) {
    // Terms first (kept from the original site), consent when a photo is used.
  }
  const caps = await store.apiCapabilities();
  if (!caps.v3) {
    const creditsEl = $("tryCredits");
    if (creditsEl) creditsEl.textContent = "AI credits: —";
    const note = $("tryAI");
    if (note) {
      note.hidden = false;
      note.textContent = t("try.needsDeploy");
    }
    const btn = $("renderTry");
    if (btn) btn.disabled = false;
  } else {
    refreshCredits();
  }

  const loading = $("loadingScreen");
  const hide = () => loading?.classList.add("done");
  window.addEventListener("load", () => setTimeout(hide, 700));
  setTimeout(hide, 2400);

  // Deep links: #try, #lib, …
  const hash = location.hash.replace("#", "");
  if (["scan", "lib", "spin", "try", "saved", "bar", "view3d"].includes(hash)) tab(hash);
  track("boot", { flags: flagSnapshot() });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
