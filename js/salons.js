// Cutfit salon finder — live results from OpenStreetMap's Overpass API.
//
// No API key and no account: Overpass is a public read-only endpoint. Coverage
// depends on local mapping, so the UI always offers a Google Maps fallback and
// tells people to call ahead. This module is deliberately DOM-free so it can be
// unit tested in Node.

// Primary endpoint plus a community mirror. Overpass is a free, shared service,
// so we try the mirror once before giving up on a network or 5xx failure.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
const CACHE_KEY = "cf_salons_v1";
const CACHE_TTL = 10 * 60 * 1000;
const CACHE_MOVE_KM = 0.5;

/** Overpass QL for hair shops and beauty salons around a point. */
export function buildOverpassQuery(lat, lon, radius = 4000) {
  const around = `(around:${Math.round(radius)},${Number(lat).toFixed(5)},${Number(lon).toFixed(5)})`;
  return `[out:json][timeout:25];(` +
    `node["shop"="hairdresser"]${around};` +
    `way["shop"="hairdresser"]${around};` +
    `node["shop"="beauty"]${around};` +
    `way["shop"="beauty"]${around};` +
    `);out center 60;`;
}

/** Great-circle distance in kilometres. */
export function distanceKm(aLat, aLon, bLat, bLon) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Guess what a shop is from OSM tags and its name.
 * "women" = salon / beauty / bridal, "barber" = barbershop, "hair" = unlabelled.
 * Explicit female/no or unisex tags always win over the name.
 */
export function classifySalon(tags = {}, name = "") {
  if (tags.female === "yes" || tags.unisex === "yes") return "women";
  if (tags.female === "no" || tags.unisex === "no") return "barber";
  const text = `${name} ${tags.shop || ""} ${tags.beauty || ""} ${tags.description || ""}`.toLowerCase();
  if (/barber|barbero|barbershop/.test(text)) return "barber";
  if (/salon|saloon|beauty|spa|bridal|blow|studio|nail|makeup|lashes/.test(text)) return "women";
  return "hair";
}

/** Turn one Overpass element into the flat record the UI uses. */
export function normaliseElement(el) {
  if (!el || typeof el !== "object") return null;
  const tags = el.tags || {};
  const lat = Number(el.lat ?? el.center?.lat);
  const lon = Number(el.lon ?? el.center?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const name = String(tags.name || tags["name:en"] || "Hair shop").slice(0, 80);
  const address = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:suburb"] || tags["addr:barangay"] || tags["addr:city"]
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 140);
  return {
    id: `${el.type || "node"}/${el.id ?? `${lat},${lon}`}`,
    name,
    lat,
    lon,
    address,
    phone: String(tags.phone || tags["contact:phone"] || "").slice(0, 40),
    // Hours and contact details are only shown when OSM actually has them.
    source: "openstreetmap",
    hours: String(tags.opening_hours || "").slice(0, 80),
    website: String(tags.website || tags["contact:website"] || "").slice(0, 200),
    kind: classifySalon(tags, name)
  };
}

/** Dedupe (chains can be mapped twice) and sort nearest first. */
export function sortByDistance(items, from) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    if (!item) continue;
    const key = `${item.name}|${item.lat.toFixed(3)}|${item.lon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...item,
      distance: from ? distanceKm(from.lat, from.lon, item.lat, item.lon) : null
    });
  }
  return out.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
}

function error(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function readCache(lat, lon) {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    if (Date.now() - Number(parsed.at || 0) > CACHE_TTL) return null;
    if (distanceKm(lat, lon, Number(parsed.lat), Number(parsed.lon)) > CACHE_MOVE_KM) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

function writeCache(lat, lon, items) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), lat, lon, items }));
  } catch {
    /* private mode */
  }
}

/** Browser geolocation with a friendly, coded error. */
export function locate({ timeout = 12000 } = {}) {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return Promise.reject(error("Location needs a secure (https) page.", "insecure"));
  }
  if (!navigator.geolocation) {
    return Promise.reject(error("This browser has no location support.", "unsupported"));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => {
        const code = err?.code === 1 ? "denied" : err?.code === 3 ? "timeout" : "unavailable";
        reject(error(err?.message || "Location is unavailable.", code));
      },
      { enableHighAccuracy: false, timeout, maximumAge: 5 * 60 * 1000 }
    );
  });
}

/**
 * Query Overpass for hair shops near a point.
 * @returns {Promise<Array>} records already sorted by distance
 */
export async function findSalons({ lat, lon, radius = 4000, signal } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw error("A location is needed to search nearby salons.", "location");
  }
  const cached = readCache(lat, lon);
  if (cached) return sortByDistance(cached, { lat, lon });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  const body = `data=${encodeURIComponent(buildOverpassQuery(lat, lon, radius))}`;
  let res = null;
  let lastStatus = 0;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body,
        signal: controller.signal
      });
    } catch (err) {
      if (err?.name === "AbortError") {
        clearTimeout(timer);
        throw error("The salon search timed out.", "timeout");
      }
      res = null;
      continue;
    }
    lastStatus = res.status;
    // Retry on the mirror for rate limits and server-side failures only.
    if (res.ok || (res.status !== 429 && res.status < 500)) break;
  }
  clearTimeout(timer);

  if (!res) throw error("The salon search could not reach OpenStreetMap.", "network");
  if (!res.ok) {
    if (lastStatus === 429) throw error("OpenStreetMap is busy right now. Try again in a minute.", "busy");
    throw error(`OpenStreetMap answered ${lastStatus}.`, "http");
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw error("OpenStreetMap sent an unexpected answer.", "parse");
  }

  const items = (data?.elements || []).map(normaliseElement).filter(Boolean);
  writeCache(lat, lon, items.map(({ distance, ...rest }) => rest));
  return sortByDistance(items, { lat, lon });
}

/** Google Maps search used when geolocation is refused. */
export function mapsSearchUrl(query = "salon for women near me") {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
