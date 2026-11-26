// Cutfit service worker — app shell caching + offline fallback.
// It never caches API calls, fal.ai images or generated previews.

const VERSION = "cutfit-v3.2.1";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=3.2.1",
  "./offline.html",
  "./manifest.webmanifest",
  "./privacy.html",
  "./js/app.js?v=3.2.1",
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
      // addAll is atomic: one missing file used to leave the shell empty, so the
      // offline page never existed. Cache each entry on its own instead.
      .then((cache) =>
        Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: "reload" }))))
      )
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

// Page, CSS and JS must never come from different deploys: a cached styles.css
// paired with a fresh index.html used to render unstyled icons at full size.
const isCode = (url) => /\.(css|js)$/i.test(url.pathname);

const networkFirst = (request, offlinePage = false) =>
  fetch(request)
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy)).catch(() => {});
      }
      return res;
    })
    .catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (offlinePage) return (await caches.match("./offline.html")) || Response.error();
      return Response.error();
    });

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!isCacheable(url)) return;

  // Navigations, CSS and JS: network first so HTML and styles always match.
  if (request.mode === "navigate" || isCode(url)) {
    event.respondWith(networkFirst(request, request.mode === "navigate"));
    return;
  }

  // Images and fonts: cache first, refresh in the background.
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
