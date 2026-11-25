// Cutfit store — device-local data plus the only network helper.
// Everything here fails soft: private mode, disabled storage and offline all
// degrade to an in-memory session instead of crashing the app.

import { getLang } from "./i18n.js";

export const KEYS = {
  consent: "cf_consent_v2",
  favs: "cf_favs",
  custom: "cf_custom",
  reviews: "cf_rv",
  device: "cf_device",
  consentAt: "cf_consent_at"
};

const memory = new Map();

function readRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.has(key) ? memory.get(key) : null;
  }
}

function writeRaw(key, value) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: keep it in memory for this session */
  }
}

export function readJSON(key, fallback) {
  const raw = readRaw(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    writeRaw(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function removeKey(key) {
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- API client

const API_BASE =
  document.querySelector('meta[name="cutfit-api"]')?.content?.replace(/\/+$/, "") ||
  "https://cutfit-ai-api.jhayc-chua06.workers.dev";

export class ApiError extends Error {
  constructor(message, { status = 0, code = "error", retryable = false } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export function apiBase() {
  return API_BASE;
}

/** Anonymous device id — used only for credit limits and abuse protection. */
export function deviceId() {
  let id = readRaw(KEYS.device);
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id =
      (crypto.randomUUID && crypto.randomUUID().replace(/-/g, "")) ||
      Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    writeRaw(KEYS.device, id);
  }
  return id;
}

const FRIENDLY_NETWORK =
  "We could not reach the Cutfit service. Check your connection and try again.";

/**
 * JSON fetch with a hard timeout and calm error messages.
 * @returns {Promise<any>}
 */
export async function api(path, { method = "GET", body, timeoutMs = 20000, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": deviceId(),
        "X-Cutfit-Lang": getLang()
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      mode: "cors",
      credentials: "omit",
      cache: "no-store"
    });
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === "AbortError") {
      throw new ApiError("The service is taking too long. Please try again in a moment.", {
        code: "timeout",
        retryable: true
      });
    }
    throw new ApiError(FRIENDLY_NETWORK, { code: "network", retryable: true });
  }
  clearTimeout(timer);

  const text = await res.text().catch(() => "");
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 200) };
    }
  }
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status}).`, {
      status: res.status,
      code: data.code || "http",
      retryable: res.status === 429 || res.status >= 500
    });
  }
  return data;
}

// ------------------------------------------------------------------- credits

let creditsCache = null;

export function cachedCredits() {
  return creditsCache;
}

export function setCachedCredits(value) {
  if (typeof value === "number" && Number.isFinite(value)) creditsCache = Math.max(0, Math.round(value));
  return creditsCache;
}

// ----------------------------------------------------------------- favorites

export function getFavs() {
  const list = readJSON(KEYS.favs, []);
  return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
}

export function isFav(name) {
  return getFavs().includes(name);
}

export function toggleFav(name) {
  const list = getFavs();
  const next = list.includes(name) ? list.filter((x) => x !== name) : [...list, name];
  writeJSON(KEYS.favs, next);
  return next.includes(name);
}

export function setFavs(list) {
  writeJSON(KEYS.favs, [...new Set((list || []).filter((x) => typeof x === "string"))]);
}

// --------------------------------------------------------------- custom cuts

export function getCustoms() {
  const list = readJSON(KEYS.custom, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => r && typeof r === "object" && typeof r.name === "string")
    .map((r) => ({ ...r, name: String(r.name).slice(0, 40) }));
}

export function saveCustoms(list) {
  writeJSON(KEYS.custom, list);
}

// ------------------------------------------------------------------- reviews

export function getReviews() {
  const data = readJSON(KEYS.reviews, {});
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

export function addReview(placeId, review) {
  const all = getReviews();
  const list = Array.isArray(all[placeId]) ? all[placeId] : [];
  list.push({ s: Number(review.s) || 5, t: String(review.t || "").slice(0, 140) });
  all[placeId] = list;
  writeJSON(KEYS.reviews, all);
  return all;
}

// ------------------------------------------------------------------- consent

export function hasConsent() {
  try {
    return localStorage.getItem(KEYS.consent) === "1";
  } catch {
    return memory.get(KEYS.consent) === "1";
  }
}

export function setConsent(granted) {
  if (granted) {
    writeRaw(KEYS.consent, "1");
    writeRaw(KEYS.consentAt, new Date().toISOString());
  } else {
    removeKey(KEYS.consent);
  }
}

/**
 * Remove every photo-derived thing we keep on this device.
 * Saved hairstyles are not photo data, so they are kept deliberately.
 */
export function deletePhotos() {
  for (const key of [KEYS.consent, KEYS.consentAt]) removeKey(key);
  creditsCache = null;
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- capabilities
// The page ships ahead of the Worker: until /api/config answers with apiVersion
// >= 3, the credits and analytics endpoints do not exist, so we skip them
// instead of firing requests that fail. Cached per session.

const CAP_KEY = "cf_api_caps";
let capValue = null;
let capPromise = null;

function readCapCache() {
  try {
    const raw = sessionStorage.getItem(CAP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > (parsed.ttl || 60000)) return null;
    return {
      v3: Boolean(parsed.v3),
      apiVersion: Number(parsed.apiVersion || 0),
      turnstileSiteKey: parsed.turnstileSiteKey || null
    };
  } catch {
    return null;
  }
}

export async function apiCapabilities({ force = false } = {}) {
  if (!force) {
    if (capValue) return capValue;
    if (capPromise) return capPromise;
    const cached = readCapCache();
    if (cached) {
      capValue = cached;
      return cached;
    }
  }
  capPromise = (async () => {
    try {
      const data = await api("/api/config", { timeoutMs: 6000 });
      const version = Number(data?.apiVersion || 0);
      capValue = {
        v3: version >= 3,
        apiVersion: version,
        turnstileSiteKey: data?.turnstileSiteKey || null
      };
    } catch {
      capValue = { v3: false, apiVersion: 0, turnstileSiteKey: null };
    }
    try {
      sessionStorage.setItem(
        CAP_KEY,
        JSON.stringify({ ...capValue, at: Date.now(), ttl: capValue.v3 ? 1800000 : 60000 })
      );
    } catch {
      /* private mode */
    }
    capPromise = null;
    return capValue;
  })();
  return capPromise;
}

/** True once we know the Worker under the page supports the v3 endpoints. */
export function apiV3() {
  return Boolean(capValue?.v3);
}

export function clearCapabilities() {
  capValue = null;
  capPromise = null;
  try {
    sessionStorage.removeItem(CAP_KEY);
  } catch {
    /* ignore */
  }
}
