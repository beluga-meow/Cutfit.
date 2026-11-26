# Cutfit 3.0

Face-shape haircut recommendations, a guided on-device face scan, mask-based AI
previews, a Three.js head simulator, and a one-page barber card you can hand to
your barber (English + Filipino, prices in pesos).

The original single-file site was split into ES modules, hardened, and extended.
Everything that worked before still works: the 71-cut catalog, the face-shape
guide, the roulette, the barber list with local reviews, the guide chat and the
AI try-on endpoint.

---

## Run it locally

```bash
npm run serve          # python3 -m http.server 3000 - serves the static site
# open http://localhost:3000

npm run worker:dev     # optional: the API Worker on http://localhost:8787
npm test               # 32 unit tests (face-shape math + Worker routes)
```

No build step, no bundler. Modules are loaded natively; MediaPipe and Three.js
are pinned and fetched from jsDelivr only when used.

> Camera and MediaPipe need `https://` or `localhost`. Use a tunnel for phone
> testing; a plain `file://` open will not load modules.

---

## Changelog by phase

### Phase 1 — refactor and safety net

- `index.html` now holds markup only; all CSS moved to `styles.css`, all logic
  to `js/*.js`.
- Modules: `scan.js`, `face-shape.js`, `tryon.js`, `viewer3d.js`, `barbers.js`,
  `guide.js`, `store.js`, `i18n.js`, plus `app.js` (bootstrap), `flags.js`
  (feature flags) and `catalog.js` (the cut catalog + structured barber specs).
  `catalog.js` was split out of `barbers.js` so the catalog is data, not UI.
- Every `innerHTML` that touches user or remote text is escaped with a single
  `esc()` helper, and the guide chat, toasts, statuses and card previews use
  `textContent`. Search terms are escaped before being echoed back.
- The old flat-colour `drawTry` hairstyle blob is gone. The try-on canvas now
  shows the untouched photo and the AI composite only.
- Feature flags: `scanV2`, `aiV2`, `viewer3d` (defaults on, overridable with
  `?flags=scanV2:0` or five taps on the logo → debug panel).
- Terms text kept verbatim, with the new photo/credit wording appended.

**Test:** open the site, click every tab, resize to 360 px. `?flags=viewer3d:0`
should hide the 3D tab and the "Create your own" buttons' destination.

### Phase 2 — advanced face scan

- MediaPipe `@mediapipe/tasks-vision@1.2.3`, `FaceLandmarker` (478 landmarks):
  `VIDEO` for the camera, `IMAGE` for uploads.
- Live guide with an oval overlay and messages: move closer / too far / centre /
  look straight / too dark / too bright / blurry / glasses-or-hair occlusion.
  Quality comes from face size, centring, yaw-pitch-roll, mean luminance, blown
  highlights and variance-of-Laplacian blur.
- Auto-capture after ~1 s of good frames (`Scan.startLiveCamera`).
- True hairline from `ImageSegmenter` + `hair_segmenter` (512×512, category 1 =
  hair), used instead of landmark 10. Falls back to the brow line and says so.
- Measurements: face length, forehead, cheekbone and jaw width, left/right jaw
  angle, chin width and shape, averaged over up to 8 frames with a robust
  median and median-absolute-deviation stability score.
- The `exp(-14·…)` classifier is replaced by Gaussian scoring with documented
  tolerances and weights, and a High/Medium/Low confidence label instead of a
  fake percentage.
- Drawing is a light mesh + face-oval contour. No dots. A hidden **Fine-tune**
  toggle reveals eight draggable handles.
- Test bench: `test/classifier.html` (7 prototype rows, 5 hard cases, live
  sliders). Automated: `tests/face-shape.test.mjs`.

**Test:** `test/classifier.html` should show “✅ all 7 prototypes classify as
themselves” and no red rows. In the app, upload a straight-on photo: expect a
contour, a quality line, then confidence + specs.

### Phase 3 — AI haircut pipeline

- Prompt is built from structured specs (`sides, top, fade, part, texture,
  fringe, finish, upkeep`) in `Catalog.barberSpecs`, sanitised server-side too.
- Client builds a hair mask from the segmenter (dilated), sends it with the
  photo; the Worker calls `fal-ai/qwen-image-edit/inpaint` with `mask_url`,
  `strength: 0.93`, `num_inference_steps: 30` and an optional `seed`.
- `mask_url` is documented as a URL. The Worker sends the PNG data URL first; if
  fal answers 4xx (no job is created, so nothing is double-charged) it stores the
  mask in R2, retries once with `https://<worker>/api/mask/<key>`, and reports
  `maskSource: "r2"` in the response and logs. Masks are deleted by the same
  cron as results.
- After the result returns, `compositeMasked()` keeps every original pixel
  outside the mask and blends with a smoothstep. Identity, skin and background
  cannot change by construction.
- Seed field, Regenerate, before/after slider, progress messages, optional
  colour pass and optional beard pass (separate mask + separate call).
- Front/side/back buttons: front is your AI result; side/back tell you plainly
  that they need a second (side or back) photo instead of faking a view.
- Worker hardening: strict image/mask/seed/prompt validation, 14 MB body cap,
  25 s submit timeout with one retry on 429/5xx, poll socket timeouts, clean
  error codes, R2 result storage and cron deletion.

**Test:** with `FAL_KEY` set, Generate AI with a selfie; move the slider; press
Regenerate and confirm the seed changes; check the R2 object disappears after
the TTL (`wrangler r2 object list cutfit-results`).

### Phase 4 — realistic-ish 3D head

- Lazy `viewer3d.js`: Three.js `0.187.0` from jsDelivr `+esm` is imported only
  when the 3D tab opens.
- Face patch built from the mesh landmarks (depth blended from nose, forehead,
  chin and cheeks), textured with your photo and alpha-masked by the face-oval
  edges; a fitted skull mesh fills the back and sides with a skin colour sampled
  from your photo.
- `MeshPhysicalMaterial` with anisotropy + sheen for hair, PCF soft shadows, a
  contact-shadow plane, four lighting presets, OrbitControls drag, Front / Side
  / Back / Top presets, length, fade, colour and PNG snapshot export.
- WebGL/device check with a fallback message pointing to the AI preview.
- Asset pipeline: `assets/hair/manifest.json` + `assets/hair/README.md`. One
  built-in example (procedural alpha cards) is clearly labelled; **no real hair
  GLB is included**, and the UI says so.

**Test:** open 3D after loading a photo. Drag, use presets, move length/fade,
change lighting, save a snapshot. Expect the honest “no licensed hair asset”
notice.

### Phase 5 — security, credits, privacy

- Credits moved to KV per device (10, +1 every 3 h), plus per-IP minute/day
  limits and a global `DAILY_CAP` generation cap per UTC day.
- Optional Turnstile: set `TURNSTILE_SECRET` (and `TURNSTILE_SITE_KEY` for the
  page) and the Worker verifies every generation.
- Consent dialog before the camera and before any upload; “Delete my photos” in
  the footer, My looks and the privacy page.
- `privacy.html` in plain language.
- `ALLOWED_ORIGIN` is exact-match; CORS/security headers on every Worker
  response; CSP meta in `index.html`; `_headers` for Cloudflare Pages.

**Test:** block the Origin header (`curl -X POST …`) → 403. Six rapid POSTs →
429 with `Retry-After`. Set `DAILY_CAP=1`, generate twice → 503 `cap`.

### Phase 6 — product and polish

- Barber card: A4 PNG + print-to-PDF + Web Share, with specs, face shape,
  before/after and your shop name.
- Share button for the before/after pair.
- Women’s and gender-neutral filters plus hair-type filters (straight, wavy,
  curly, coily) with matching prompt language.
- Filipino/English UI toggle (`js/i18n.js`), peso formatting for barbers.
- PWA: `manifest.webmanifest`, generated icons, `sw.js` app-shell cache,
  `offline.html`, install button.
- SEO: description, canonical, Open Graph, Twitter card, JSON-LD `WebApplication`.
- A11y: keyboard tabs/buttons, focus-visible rings, aria labels and live
  regions, reduced-motion support, contrast fixes on filter labels.
- Performance: critical path measured at **72 KB gzip** (HTML + CSS + all
  eagerly imported JS). Three.js and MediaPipe load on demand.
- Analytics: event names only, beacons to `/api/event` → Cloudflare logs. Errors
  go to `/api/log`. No third-party scripts.
- Tests: `tests/face-shape.test.mjs`, `tests/worker.test.mjs`; manual checklist
  in `QA.md`.

---

## File tree

```
.
├── index.html               # markup, CSP meta, SEO, JSON-LD
├── styles.css               # all CSS (old studio theme + new components)
├── index.js                 # Cloudflare Worker (API only)
├── wrangler.jsonc           # KV + R2 + cron + vars
├── package.json             # scripts, no runtime deps
├── _headers                 # security headers for Cloudflare Pages
├── robots.txt
├── manifest.webmanifest
├── sw.js                    # app-shell cache + offline fallback
├── offline.html
├── privacy.html
├── js/
│   ├── app.js               # bootstrap, tabs, scan UI, try-on UI, 3D UI
│   ├── flags.js             # scanV2 / aiV2 / viewer3d
│   ├── catalog.js           # 71 cuts, shape copy, structured barber specs
│   ├── face-shape.js        # measurements + calibrated classifier (pure)
│   ├── scan.js              # MediaPipe landmarker, segmenter, quality gate
│   ├── tryon.js             # prompt builder, fal job, compositing, share
│   ├── viewer3d.js          # lazy Three.js head + hair manifest loader
│   ├── barbers.js           # barber data, reviews, barber card
│   ├── guide.js             # deterministic guide chat
│   ├── store.js             # local data + API client + device id
│   └── i18n.js              # English/Filipino dictionary
├── assets/
│   ├── hair/
│   │   ├── manifest.json    # add your GLB styles here
│   │   └── README.md        # asset requirements + where to licence hair
│   └── icons/               # icon-192, icon-512, og-cover, favicon.svg
├── scripts/make-icons.mjs   # regenerates the PNG icons, no dependencies
├── test/classifier.html     # visual classifier bench
├── tests/
│   ├── face-shape.test.mjs
│   └── worker.test.mjs
└── QA.md                    # manual QA checklist
```

---

## Cloudflare setup

### 1. KV (credits + rate limits)

```bash
npx wrangler kv namespace create CREDITS
# copy the id into wrangler.jsonc -> kv_namespaces[0].id
```

### 2. R2 (temporary previews)

```bash
npx wrangler r2 bucket create cutfit-results
```

Already declared in `wrangler.jsonc` as binding `RESULTS`. The cron trigger
(`*/15 * * * *`) deletes expired objects; set `RESULT_TTL_SECONDS` to change the
15-minute default.

### 3. Secrets and vars

```bash
npx wrangler secret put FAL_KEY              # your fal.ai key
npx wrangler secret put TURNSTILE_SECRET     # optional, enables Turnstile
```

| Name | Where | Meaning |
| --- | --- | --- |
| `ALLOWED_ORIGIN` | var | exact origin(s), comma separated, no path/slash |
| `DAILY_CAP` | var | max generations per UTC day (default 150) |
| `RESULT_TTL_SECONDS` | var | R2 lifetime of a preview (default 900) |
| `FAL_KEY` | secret | fal.ai API key |
| `TURNSTILE_SECRET` | secret | optional Turnstile secret |
| `TURNSTILE_SITE_KEY` | var | optional, exposed via `/api/config` |

### 4. Full deploy sequence

```bash
# from the repository root, once per account
npx wrangler login

# one-time resources
npx wrangler kv namespace create CREDITS      # paste the id into wrangler.jsonc
npx wrangler r2 bucket create cutfit-results

# secrets (you are prompted, nothing is echoed back)
npx wrangler secret put FAL_KEY
npx wrangler secret put TURNSTILE_SECRET      # optional

# ship it
npm run worker:deploy
curl https://cutfit-ai-api.jhayc-chua06.workers.dev/api/health
# {"ok":true,"hasFalKey":true,"hasKV":true,"hasR2":true,…}

# confirm the page sees the new Worker (apiVersion must be 3)
curl https://cutfit-ai-api.jhayc-chua06.workers.dev/api/config
```

Until that deploy happens the page deliberately stays quiet: it probes
`/api/config` once per session, and while the answer is not `apiVersion: 3` it
skips `/api/credits`, `/api/event` and `/api/log` entirely, shows “AI credits:
—” and explains in the try-on tab that a deploy is pending. Nothing errors and
nothing is logged.

### 5. Does fal.ai take the mask as a data URL?

The Worker already retries with an R2-hosted mask when fal says no, so a
rejection costs one extra round trip, not a failure. To know which path your
key takes:

```bash
FAL_KEY=<your key> npm run check:mask        # one real call, ~$0.03
```

It sends the exact payload shape the page sends — a synthetic 768×768 portrait
and hair mask as PNG data URLs — polls the queue and prints one of:

- `✅ Data-URL mask ACCEPTED` — nothing to change.
- `❌ … 422 … mask_url` — data URLs are rejected; the Worker's R2 fallback is
  the path you will actually use (no code change needed). Check the Cloud log
  for `"maskSource":"r2"` to confirm.
- Exit 3 — `FAL_KEY` missing or the network failed.

`npm run check:mask -- --dry-run` builds the images and sends nothing.

### 6. Point the page at the Worker

`index.html` has `<meta name="cutfit-api" content="https://…workers.dev">`.
Change it if your Worker URL differs. Add your site origin to `ALLOWED_ORIGIN`
(and the preview origin while testing).

---

## Cost

`fal-ai/qwen-image-edit/inpaint` costs **$0.03 per megapixel** (published
price). The page downscales to 1024 px on the long edge, so one preview is about
1 MP ≈ **$0.03**. Multipliers:

| Action | Calls | Approx. cost |
| --- | --- | --- |
| Generate AI | 1 | $0.03 |
| Regenerate | 1 | $0.03 |
| Colour pass | 1 | $0.03 |
| Beard pass | 1 | $0.03 |

`DAILY_CAP=150` therefore caps fal.ai spend at roughly **$4.70/day** even if
someone abuses the endpoint. Lower it if that is too high for you. Cloudflare
KV/R2/cron usage at this scale is inside the free tier.

Legacy mask-less requests (old cached pages) fall back to
`fal-ai/qwen-image-edit/image-to-image` at the same per-megapixel price.

---

## What I verified, and what I could not

Verified against live docs/registries on 25 Nov 2026:

- `fal-ai/qwen-image-edit/inpaint` input schema (`prompt`, `image_url`,
  `mask_url`, `strength`, `seed`, `num_inference_steps`, `output_format`) and
  the $0.03/MP price, from the endpoint's `llms.txt`.
- `@mediapipe/tasks-vision@1.2.3` type definitions: `detect(image)`,
  `detectForVideo(frame, timestamp)`, `segment`/`segmentForVideo`,
  `outputCategoryMask`, `MPMask.getAsUint8Array()`,
  `FaceLandmarker.FACE_LANDMARKS_TESSELATION` / `FACE_LANDMARKS_FACE_OVAL`.
  (The web guide still shows `detectForVideo(video)`; the shipped `.d.ts`
  requires a timestamp, and that is what the code uses.)
- Hair segmenter model URL `…/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite`
  returns 200; categories are 0 = background, 1 = hair.
- three.js `0.187.0` and its `+esm` addon builds return 200, and the addons
  import the same `three` URL (single instance).
- The page boots in Chromium with no page errors, 12 library cards, 13 try-on
  cards, 8 barbers, 7 tabs, at 360 px with no horizontal overflow.
- The mask fallback is covered by tests: a stubbed 422 triggers exactly one
  retry with an R2 URL, the object is served from `/api/mask/<key>` as
  `image/png`, and the cron deletes it (38/38 tests pass).

**Not verified here (needs your account/device):**

- A real end-to-end generation: no `FAL_KEY` and no camera in this environment,
  so I could not observe fal.ai's answer for a data-URL mask. Run
  `npm run check:mask` with your key to get the definitive answer; either answer
  works because the Worker retries with the R2-hosted mask automatically.
- Turnstile verification against a real site key.
- `observability`/cron behaviour on your account, and KV consistency under
  concurrent abuse (limits are best-effort by design).
- Lighthouse mobile score: the 72 KB budget is measured, the score is not.
  Run Lighthouse yourself; the biggest remaining cost is MediaPipe WASM on
  first scan.

---

## Unfinished / decisions for you

1. **Hair assets.** There is no realistic hair GLB. The viewer ships a
   procedural example and an honest notice. You need to model or licence at
   least one style; `assets/hair/README.md` lists the requirements.
2. **Mask upload format.** Decide after `npm run check:mask`: if data URLs are
   rejected, every generation will use the R2 path (one extra write per job).
   If they are accepted, the fallback simply never fires.
3. **Side/back views.** These need a second photo; nothing is faked. Decide
   whether to add a guided “second angle” capture step.
4. **Turnstile.** Optional and off. Turn it on if the site gets scraped.
5. **i18n scope.** Navigation, scan guidance, consent and try-on controls are
   translated. Cut names, descriptions and the full Terms remain in English.
   Say the word if you want the Terms translated too.
6. **Barber data** is still the Nov 21, 2026 Google Maps snapshot; refresh it
   manually.
7. **Analytics** is event-only via Cloudflare logs. If you want a dashboard,
   add Workers Analytics Engine rather than a third-party tracker.

## Cutfit 3.1 — live salon finder, wider library, cleaner copy

**Salon finder (new).** The Barbers tab now opens with “Salons for women near you”. It uses the
browser’s location (only after you tap the button) and queries the public
[OpenStreetMap Overpass API](https://overpass-api.de) for `shop=hairdresser` and `shop=beauty`
within about 4 km. Results are de-duplicated, sorted by distance and filtered by how the shop is
tagged or named (`female=yes` / `unisex=yes` → salon, `barber` → barbershop). Each card links to
Maps, directions and, when mapped, the shop’s phone number. No API key, no account, no server.

- `js/salons.js` holds the query builder, distance maths, tag classification and a 10-minute
  `sessionStorage` cache. It is DOM-free and unit tested in `tests/salons.test.mjs`.
- Failure modes are explicit: location denied, no geolocation support, timeout, Overpass busy (429)
  and network error each show their own message, and the Google Maps search stays available.
- The CSP `connect-src` now allows `https://overpass-api.de` only.
- Honest limit: OSM coverage depends on local mapping. The UI says so and tells people to call ahead.

**Library.** 71 → 91 styles, with ten new women’s cuts (curtain bob, curly bob, coily bob, textured
lob, long curtain layers, grown-out pixie, blunt centre-part bob, wavy bob, soft shag with bangs,
layered shoulder cut), six men’s and four neutral cuts. `tests/catalog.test.mjs` now checks every
entry (unique name, audience, length, era, figure parameters, description, SVG render).

**Convenience.** Search box above the try-on shelf filters the featured styles; the roulette result
now suggests a useful next step instead of a joke; the empty “My looks” state explains how to save.

**Copy.** The tagline is now “Haircut studio for everyone” (FIL: “Study ng gupit para sa lahat”),
the style profile card was rewritten, and the Barbers tab covers both barbers and salons.

**Wiring.** `wrangler.jsonc` now carries the real KV namespace id
(`3c6969729d5a40a6889fea0738b73922`) for the `CREDITS` binding. The Worker still has to be deployed
before credits, analytics and AI generation work end to end.

**fal.ai data-URL mask check — not verified.** `scripts/check-mask-data-url.mjs` was run with the
key supplied in chat in both plausible formats; fal.ai answered `HTTP 401 invalid key credentials`
and `Cannot access application "fal-ai/qwen-image-edit"`, so no job was created and no charge was
made. A fal key is normally `<key_id>:<key_secret>` with a long hex secret — re-copy it from
<https://fal.ai/dashboard/keys> and run `FAL_KEY='…' npm run check:mask`. The Worker’s R2 mask
fallback stays in place either way.

## Cutfit 3.2 — inline icons, mobile layout, honest credits

**Icons.** Every icon is one inline `<svg>` sprite (`<symbol id="i-…">`) at the top of
`index.html`, referenced with `<use href="#i-…">`. There are no separate icon files to
404 on GitHub Pages, nothing to precache, and `stroke="currentColor"` inherits the
label colour. Nav (Scan, Styles, Roulette, Try-on, 3D, My looks, Barbers), the camera
empty state, the help button, the four try-on tools and the save/download buttons all
use it. `assets/icons/favicon.svg`, `icon-192.png` and `icon-512.png` stay for the
manifest and the browser tab.

**Mobile layout.** The style search is full width, the five dropdowns are a two-column
grid (one column under 340 px) inside a collapsible *Filters* button that shows the
active-filter count. Controls are 44 px tall at 16 px so iOS does not zoom. The main
column reserves `--nav-h` + safe-area space, so the bottom nav never covers the page
counters, and the guide is a 44 px round button sitting above the nav.

**Try-on.** With no photo, the canvas is not rendered; the "Start with a clear selfie"
card is shown instead. The view label sits above the slider, the generate/regenerate
buttons share a row, and the credit pill shows `AI credits: N/M`, or
`AI credits: offline — tap to retry` when the Worker cannot be reached. It is never a
bare dash.

**Error 1042.** `https://cutfit-ai-api.jhayc-chua06.workers.dev/api/health` returns
`HTTP 404` with the body `error code: 1042`. Cloudflare documents 1042 as *"Worker tried
to fetch from another Worker on the same zone… Also returned for a workers.dev URL with
no Worker serving it, such as a Worker with its workers.dev route disabled."* The API
code never fetches itself, so this is routing, not application logic: no Worker is
serving that hostname under the account. Confirm the Worker exists under the account
that owns `jhayc-chua06`, that its workers.dev route is enabled, then:

```sh
npx wrangler login          # or set CLOUDFLARE_API_TOKEN (Workers Scripts: Edit)
npx wrangler secret put FAL_KEY
npm run worker:deploy
curl https://cutfit-ai-api.jhayc-chua06.workers.dev/api/health
curl https://cutfit-ai-api.jhayc-chua06.workers.dev/api/config   # expect "apiVersion":3
```

`npx wrangler deploy --dry-run` bundles in 24.77 KiB gzip 7.47 KiB and resolves the
`CREDITS` KV namespace, `RESULTS` R2 bucket and the three vars, so `wrangler.jsonc` and
the Worker name (`cutfit-ai-api`) are correct.

**Salons.** Overpass now falls back to `overpass.kumi.systems` on 429/5xx or a network
error, geolocation reports an explicit insecure-context message, and the panel carries
the required OpenStreetMap attribution link.

**Barber specs.** Women's cuts that do not contain "bob", "layer" or "butterfly"
(Hime, jellyfish, C-/S-curl, U-/V-cut, bangs, shoulder-length, wolf) no longer fall
through to the men's taper text, and the AI prompt asks for a salon-quality result
without changing the person's apparent gender or facial identity.
