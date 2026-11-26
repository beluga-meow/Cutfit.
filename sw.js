// Cutfit service worker — app shell caching + offline fallback.
// It never caches API calls, fal.ai images or generated previews.

const VERSION = "cutfit-v3.2.0";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./offline.html",
  "./manifest.webmanifest",
  "./privacy.html",
  "./js/app.js",
  "./js/flags.js",
  "./js/i18n.js",
  "./js/store.js",
  "./js/catalog.js",
  "./js/face-shape.js",
  "./js/scan.js",
  "./js/tryon.js",
  "./js/viewer3d.js",
  "./js/barbers.js",
  "./js/salons.js",
  "./js/guide.js",
  "./favicon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./assets/hair/manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isCacheable = (url) =>
  url.origin === self.location.origin &&
  !url.pathname.includes("/api/") &&
  !/\.(glb|task|tflite|wasm)$/i.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!isCacheable(url)) return;

  // Navigations: network first so updates land, offline page as last resort.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("./offline.html")) || Response.error())
    );
    return;
  }

  // Static assets: cache first, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});
