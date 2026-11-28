// Cutfit AI API — Cloudflare Worker -> fal.ai (Qwen Image Edit, inpainting)
//
// Routes
//   GET  /api/health            setup check (no key needed)
//   GET  /api/config            public limits/features
//   GET  /api/credits           credit balance for this device
//   POST /api/try-on            { imageDataUrl, maskDataUrl, prompt, seed } -> { request_id, creditsLeft }
//   GET  /api/status?id=ID      -> { status, imageUrl?, error?, creditsLeft? }
//   GET  /api/result/<key>      short-lived generated image (served from R2)
//   POST /api/event             privacy-friendly analytics ping (no cookies, no PII)
//   POST /api/log               client error logging -> Cloudflare logs
//
// Bindings / vars (wrangler.jsonc + dashboard)
//   FAL_KEY            (secret)  fal.ai key
//   ALLOWED_ORIGIN     (text)    comma separated exact origins. No path, no slash.
//   CREDITS            (KV)      credit + rate-limit counters
//   RESULTS            (R2)      generated images, auto-deleted by cron
//   DAILY_CAP          (text)    global generations per UTC day (default 150)
//   RESULT_TTL_SECONDS (text)    how long a result stays in R2 (default 900)
//   TURNSTILE_SECRET   (secret)  optional: enables Turnstile verification
//
// fal.ai cost: fal-ai/qwen-image-edit/inpaint is $0.03 per megapixel, so a
// 1024x1024 preview is about $0.0315. Every generation (colour or beard pass
// included) is one billed call. DAILY_CAP is the hard spending brake.

const MODEL = "fal-ai/qwen-image-edit/inpaint";
const MODEL_LEGACY = "fal-ai/qwen-image-edit/image-to-image"; // mask-less, old clients only
const QUEUE = "https://queue.fal.run";
const APP = MODEL.split("/").slice(0, 2).join("/");

const MAX_BODY_BYTES = 14 * 1024 * 1024;
const MAX_RESULT_BYTES = 12 * 1024 * 1024;
const IMAGE_PREFIX = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/i;
const MASK_PREFIX = /^data:image\/(png|webp);base64,[A-Za-z0-9+/=\s]+$/i;
const REQUEST_ID = /^[A-Za-z0-9_-]{8,80}$/;
const RESULT_KEY = /^[a-f0-9]{32}\.(png|jpe?g|webp)$/;
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const PROMPT_MAX = 1400;

const CREDIT_MAX = 10;
const CREDIT_INTERVAL_MS = 3 * 60 * 60 * 1000;
const PER_MINUTE_LIMIT = 6;
const PER_DAY_LIMIT = 40;

const FRIENDLY = {
  content_policy_violation:
    "The AI safety filter blocked this image. Try a different, clear photo of a face.",
  image_too_large: "This photo is too large. Try a smaller one.",
  image_too_small: "This photo is too small. Try a bigger one.",
  image_load_error: "The AI could not open this photo. Try a JPG or PNG.",
  unsupported_image_format: "Unsupported photo format. Use JPG, PNG or WebP.",
  file_too_large: "This photo file is too large. Try a smaller one.",
  no_media_generated: "The AI did not return an image. Try again or use another photo.",
  face_detection_error: "No face was found in the photo. Use a clear, front-facing photo."
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Resource-Policy": "cross-origin"
};

// ---------------------------------------------------------------- utilities

function jsonResponse(data, status, corsOrigin, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": corsOrigin,
      Vary: "Origin",
      ...SECURITY_HEADERS,
      ...extra
    }
  });
}

function parseOrigins(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (s === "*") return s;
      try { return new URL(s).origin; } catch { return s.replace(/\/+$/, ""); }
    });
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { detail: text.slice(0, 300) }; }
}

function errorMessage(data, status, fallback) {
  const d = data?.detail ?? data?.error ?? data?.message;
  const type = (Array.isArray(d) ? d[0]?.type : null) || data?.error_type || data?.type;
  if (type && FRIENDLY[type]) return FRIENDLY[type];

  let text = "";
  if (typeof d === "string") text = d;
  else if (Array.isArray(d)) text = d.map((x) => x?.msg || x?.message).filter(Boolean).join(" ");
  else if (d && typeof d === "object") text = d.message || "";
  text = String(text).slice(0, 300);

  if (status === 401) return "fal.ai rejected the API key. Check the FAL_KEY secret in your Worker.";
  if (status === 403) return "fal.ai refused the request" + (text ? `: ${text}` : ". Check your balance and API key.");
  if (status === 422) return "fal.ai rejected the request" + (text ? `: ${text}` : ".");
  if (status === 429) return "The AI service is busy right now. Wait a moment and try again.";
  return text || fallback;
}

export function sanitizePrompt(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f`"<>\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PROMPT_MAX);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
}

function intEnv(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// KV may be missing in local dev; every helper degrades to a no-op.
async function kvGet(env, key) {
  if (!env.CREDITS) return null;
  try { return await env.CREDITS.get(key); } catch { return null; }
}
async function kvPut(env, key, value, ttl) {
  if (!env.CREDITS) return;
  try { await env.CREDITS.put(key, value, ttl ? { expirationTtl: ttl } : undefined); } catch { /* ignore */ }
}

// ------------------------------------------------------------------ credits

export function creditState(raw, now = Date.now()) {
  let st = null;
  try { st = raw ? JSON.parse(raw) : null; } catch { st = null; }
  if (!st || typeof st.credits !== "number" || !Number.isFinite(st.credits)) {
    st = { credits: CREDIT_MAX, last: now };
  }
  st.credits = Math.max(0, Math.min(CREDIT_MAX, Math.floor(st.credits)));
  st.last = Number.isFinite(st.last) && st.last > 0 ? st.last : now;
  if (st.credits < CREDIT_MAX) {
    const passed = Math.max(0, now - st.last);
    const earned = Math.floor(passed / CREDIT_INTERVAL_MS);
    if (earned > 0) {
      st.credits = Math.min(CREDIT_MAX, st.credits + earned);
      st.last = st.credits === CREDIT_MAX ? now : st.last + earned * CREDIT_INTERVAL_MS;
    }
  } else {
    st.last = now;
  }
  return st;
}

async function getCredits(env, device) {
  const st = creditState(await kvGet(env, `credit:${device}`));
  return st;
}

async function saveCredits(env, device, st) {
  await kvPut(env, `credit:${device}`, JSON.stringify(st), 30 * 24 * 3600);
}

async function takeCredit(env, device) {
  const st = await getCredits(env, device);
  if (st.credits <= 0) return { ok: false, state: st };
  st.credits -= 1;
  await saveCredits(env, device, st);
  return { ok: true, state: st };
}

async function refundCredit(env, device) {
  const st = await getCredits(env, device);
  st.credits = Math.min(CREDIT_MAX, st.credits + 1);
  await saveCredits(env, device, st);
  return st;
}

async function bumpCounter(env, key, ttl) {
  const current = Number(await kvGet(env, key)) || 0;
  const next = current + 1;
  await kvPut(env, key, String(next), ttl);
  return next;
}

async function checkTurnstile(env, request, token) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  try {
    const body = new FormData();
    body.append("secret", env.TURNSTILE_SECRET);
    body.append("response", String(token).slice(0, 4000));
    body.append("remoteip", clientIp(request));
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000)
    });
    const data = await res.json().catch(() => ({}));
    return data.success === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- fal calls

async function falFetch(url, init, { timeoutMs = 20000, retries = 1 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        lastError = new Error(`fal ${res.status}`);
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw new Error(`fal request failed: ${lastError?.message || "network error"}`);
}

async function falSubmit(env, model, payload) {
  const res = await falFetch(
    `${QUEUE}/${model}`,
    {
      method: "POST",
      headers: { Authorization: `Key ${env.FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    },
    { timeoutMs: 25000, retries: 1 }
  );
  const data = await readJson(res);
  if (!res.ok) {
    return { ok: false, status: res.status, error: errorMessage(data, res.status, "AI generation request failed.") };
  }
  if (!data.request_id) return { ok: false, status: 502, error: "fal.ai did not return a request ID." };
  return { ok: true, request_id: data.request_id, queue_position: data.queue_position ?? null };
}

async function storeResult(env, imageUrl, ttl) {
  if (!env.RESULTS) return null;
  try {
    const res = await falFetch(imageUrl, { method: "GET" }, { timeoutMs: 25000, retries: 1 });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_RESULT_BYTES) return null;
    const type = res.headers.get("Content-Type") || "image/png";
    const ext = /jpe?g/i.test(type) ? "jpg" : /webp/i.test(type) ? "webp" : "png";
    const key = `${crypto.randomUUID().replace(/-/g, "")}.${ext}`;
    await env.RESULTS.put(`results/${key}`, buf, {
      httpMetadata: { contentType: type, cacheControl: "private, max-age=300" },
      customMetadata: { expires: String(Date.now() + ttl * 1000) }
    });
    return key;
  } catch {
    return null;
  }
}

function dataUrlToBytes(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  const match = /^data:(image\/(?:png|webp));base64$/i.exec(header);
  if (!match) return null;
  try {
    const binary = atob(dataUrl.slice(comma + 1).replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { bytes, type: match[1].toLowerCase() };
  } catch {
    return null;
  }
}

/**
 * Host the hair mask in R2 and return a URL fal.ai can fetch itself.
 * This is the fallback for deployments where fal.ai will not accept a data URL
 * in `mask_url`. The object is deleted by the same cron as the results.
 */
async function storeMask(env, origin, dataUrl, ttl) {
  if (!env.RESULTS) return null;
  const decoded = dataUrlToBytes(dataUrl);
  if (!decoded || decoded.bytes.byteLength > 8 * 1024 * 1024) return null;
  const key = `${crypto.randomUUID().replace(/-/g, "")}.png`;
  try {
    await env.RESULTS.put(`masks/${key}`, decoded.bytes, {
      httpMetadata: { contentType: "image/png", cacheControl: "private, max-age=300" },
      customMetadata: { expires: String(Date.now() + ttl * 1000) }
    });
    return `${origin}/api/mask/${key}`;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ handler

// The real handlers live on this object and are wrapped by the default export
// below, so a thrown error can never escape the request as Cloudflare Error
// 1101 (a non-JSON 500 with no diagnostic for the page).
const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = parseOrigins(env.ALLOWED_ORIGIN);
    const openToAll = allowed.length === 0 || allowed.includes("*");
    const originOk = openToAll || !origin || allowed.includes(origin);
    const corsOrigin = openToAll ? "*" : origin && allowed.includes(origin) ? origin : allowed[0] || "*";
    const json = (data, status = 200, extra = {}) => jsonResponse(data, status, corsOrigin, extra);

    if (request.method === "OPTIONS") {
      if (!originOk) return new Response(null, { status: 403, headers: SECURITY_HEADERS });
      return new Response(null, {
        status: 204,
        headers: {
          ...SECURITY_HEADERS,
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-Cutfit-Lang",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin"
        }
      });
    }

    if (!originOk) {
      return json({ error: `Origin not allowed. Set ALLOWED_ORIGIN to exactly ${origin}.`, code: "origin" }, 403);
    }

    const path = url.pathname.replace(/\/+$/, "") || "/";

    // ---- temporary images: generated results and short-lived hair masks.
    // <img> and fal.ai fetch these without an Origin header, so they are public
    // but unguessable and expire quickly.
    if ((path.startsWith("/api/result/") || path.startsWith("/api/mask/")) && request.method === "GET") {
      const isMask = path.startsWith("/api/mask/");
      const key = path.slice((isMask ? "/api/mask/" : "/api/result/").length);
      if (!RESULT_KEY.test(key)) return json({ error: "Not found." }, 404);
      if (!env.RESULTS) return json({ error: "Storage is not configured." }, 503);
      const obj = await env.RESULTS.get(`${isMask ? "masks" : "results"}/${key}`);
      if (!obj) return json({ error: "This preview expired. Generate a new one.", code: "expired" }, 410);
      return new Response(obj.body, {
        status: 200,
        headers: {
          ...SECURITY_HEADERS,
          "Content-Type": obj.httpMetadata?.contentType || "image/png",
          "Cache-Control": "private, max-age=300",
          "Access-Control-Allow-Origin": corsOrigin,
          Vary: "Origin"
        }
      });
    }

    if (path === "/api/health" || path === "/") {
      return json({
        ok: true,
        service: "Cutfit AI API",
        message: "Backend is running",
        hasFalKey: Boolean(env.FAL_KEY),
        hasKV: Boolean(env.CREDITS),
        hasR2: Boolean(env.RESULTS),
        model: MODEL,
        turnstile: Boolean(env.TURNSTILE_SECRET)
      });
    }

    if (path === "/api/config" && request.method === "GET") {
      return json({
        apiVersion: 3,
        model: MODEL,
        maxImageChars: MAX_BODY_BYTES,
        creditMax: CREDIT_MAX,
        creditIntervalMs: CREDIT_INTERVAL_MS,
        perDayLimit: PER_DAY_LIMIT,
        dailyCap: intEnv(env.DAILY_CAP, 150),
        turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
        features: { aiV2: true, resultTtlSeconds: intEnv(env.RESULT_TTL_SECONDS, 900) }
      });
    }

    const device = request.headers.get("X-Device-Id") || "";
    const hasDevice = DEVICE_ID.test(device);

    if (path === "/api/credits" && request.method === "GET") {
      if (!hasDevice) return json({ error: "Missing device id.", code: "device" }, 400);
      const st = await getCredits(env, device);
      const resetIn = st.credits >= CREDIT_MAX ? 0 : Math.max(0, CREDIT_INTERVAL_MS - (Date.now() - st.last));
      return json({ credits: st.credits, max: CREDIT_MAX, resetInMs: resetIn, creditsLeft: st.credits });
    }

    if (path === "/api/event" && request.method === "POST") {
      try {
        const text = await request.text();
        if (text.length > 2000) return json({ ok: false }, 413);
        const data = JSON.parse(text || "{}");
        // Deliberately only a name, a few props and the language. No IP, no id.
        console.log(JSON.stringify({ kind: "event", name: String(data.name || "").slice(0, 40), props: data.props || {}, lang: data.lang || "" }));
      } catch { /* ignore */ }
      return json({ ok: true });
    }

    if (path === "/api/log" && request.method === "POST") {
      try {
        const text = await request.text();
        if (text.length > 4000) return json({ ok: false }, 413);
        const data = JSON.parse(text || "{}");
        console.log(JSON.stringify({ kind: "client_error", level: data.level, message: String(data.message || "").slice(0, 300), where: data.where, code: data.code }));
      } catch { /* ignore */ }
      return json({ ok: true });
    }

    if (!env.FAL_KEY) {
      return json({ error: "FAL_KEY secret is missing in the Worker settings.", code: "config" }, 500);
    }

    // ---------------------------------------------------------- start a job
    if (path === "/api/try-on" && request.method === "POST") {
      if (!hasDevice) return json({ error: "Missing device id.", code: "device" }, 400);

      let body;
      try {
        const text = await request.text();
        if (text.length > MAX_BODY_BYTES) {
          return json({ error: "This upload is too large. Try a smaller photo.", code: "too_large" }, 413);
        }
        body = JSON.parse(text || "{}");
      } catch {
        return json({ error: "Invalid request body.", code: "body" }, 400);
      }

      const { imageDataUrl, maskDataUrl, prompt: rawPrompt, hairstyle, seed, turnstile } = body || {};

      if (typeof imageDataUrl !== "string" || !IMAGE_PREFIX.test(imageDataUrl.slice(0, 64))) {
        return json({ error: "Please provide a valid image (PNG, JPEG or WebP).", code: "image" }, 400);
      }
      if (imageDataUrl.length > MAX_BODY_BYTES) {
        return json({ error: "Image is too large. Please use a smaller photo.", code: "too_large" }, 413);
      }
      let mask = null;
      if (maskDataUrl != null) {
        if (typeof maskDataUrl !== "string" || !MASK_PREFIX.test(maskDataUrl.slice(0, 64))) {
          return json({ error: "The hair mask must be a PNG data URL.", code: "mask" }, 400);
        }
        if (maskDataUrl.length > MAX_BODY_BYTES) {
          return json({ error: "The hair mask is too large.", code: "too_large" }, 413);
        }
        mask = maskDataUrl;
      }

      // Structured prompt from the page, or a short style name from an older page.
      let prompt = sanitizePrompt(rawPrompt);
      if (!prompt && typeof hairstyle === "string") {
        const style = sanitizePrompt(hairstyle);
        if (!style) return json({ error: "Please select a valid hairstyle.", code: "prompt" }, 400);
        prompt = `Edit the uploaded portrait photo to realistically change only the person's hairstyle to: ${style}. Preserve the person's facial identity, face shape, eyes, nose, mouth, skin tone, expression, age appearance, pose, clothing, background, and lighting. Replace only the hair with a natural, realistic version of that hairstyle. Make the hair blend naturally with the person's head and hairline. Do not change the face or add accessories.`;
      }
      if (prompt.length < 15) return json({ error: "Please describe the haircut.", code: "prompt" }, 400);

      let safeSeed = null;
      if (seed != null) {
        const n = Number(seed);
        if (!Number.isInteger(n) || n < 0 || n > 2147483647) {
          return json({ error: "Seed must be a whole number between 0 and 2147483647.", code: "seed" }, 400);
        }
        safeSeed = n;
      }

      if (env.TURNSTILE_SECRET) {
        const okBot = await checkTurnstile(env, request, turnstile);
        if (!okBot) return json({ error: "Spam check failed. Please reload and try again.", code: "turnstile" }, 403);
      }

      // Rate limits (KV counters; approximate by design, see README).
      const ip = clientIp(request);
      const minuteKey = `rl:m:${ip}:${Math.floor(Date.now() / 60000)}`;
      const minuteHits = await bumpCounter(env, minuteKey, 120);
      if (minuteHits > PER_MINUTE_LIMIT) {
        return json({ error: "Too many requests. Wait a minute and try again.", code: "rate" }, 429, {
          "Retry-After": "60"
        });
      }
      const dayHits = await bumpCounter(env, `rl:d:${ip}:${today()}`, 2 * 24 * 3600);
      if (dayHits > PER_DAY_LIMIT) {
        return json({ error: "Daily limit reached for this network. Try again tomorrow.", code: "rate_day" }, 429);
      }

      const cap = intEnv(env.DAILY_CAP, 150);
      const spend = await bumpCounter(env, `spend:${today()}`, 3 * 24 * 3600);
      if (spend > cap) {
        return json({ error: "Cutfit has hit today’s global AI limit. Please try again tomorrow.", code: "cap" }, 503);
      }

      const credit = await takeCredit(env, device);
      if (!credit.ok) {
        return json(
          { error: "No AI credits left on this device. Credits refill over time.", code: "credits", creditsLeft: 0 },
          402
        );
      }

      const model = mask ? MODEL : MODEL_LEGACY;
      const payload = {
        prompt,
        image_url: imageDataUrl,
        num_images: 1,
        output_format: "jpeg",
        enable_safety_checker: true
      };
      if (safeSeed != null) payload.seed = safeSeed;
      if (mask) {
        payload.mask_url = mask;
        payload.strength = 0.93;
        payload.num_inference_steps = 30;
      }

      const ttl = intEnv(env.RESULT_TTL_SECONDS, 900);
      let submitted = await falSubmit(env, model, payload);
      let maskSource = mask ? "data-url" : "none";

      // fal.ai documents mask_url as a URL. Data URLs work for image_url, but if
      // a mask data URL is rejected we host it in R2 and retry once. A 4xx means
      // no job was created, so the retry cannot double-charge.
      if (!submitted.ok && mask && submitted.status >= 400 && submitted.status < 500 && submitted.status !== 401 && submitted.status !== 403 && submitted.status !== 429) {
        const hosted = await storeMask(env, url.origin, mask, ttl);
        if (hosted) {
          const retried = await falSubmit(env, model, { ...payload, mask_url: hosted });
          if (retried.ok) {
            submitted = retried;
            maskSource = "r2";
          }
        }
      }

      if (!submitted.ok) {
        const st = await refundCredit(env, device);
        return json({ error: submitted.error, code: "fal", creditsLeft: st.credits }, submitted.status || 502);
      }

      await kvPut(env, `job:${submitted.request_id}`, JSON.stringify({ device, ttl, model }), 3600);
      console.log(JSON.stringify({ kind: "generation", model, maskSource, requestId: submitted.request_id }));

      return json({
        success: true,
        request_id: submitted.request_id,
        queue_position: submitted.queue_position,
        creditsLeft: credit.state.credits,
        model,
        maskSource
      });
    }

    // ------------------------------------------------------------- poll job
    if (path === "/api/status" && request.method === "GET") {
      const id = url.searchParams.get("id") || "";
      if (!REQUEST_ID.test(id)) return json({ error: "Missing or invalid request ID.", code: "id" }, 400);

      let job = null;
      try { job = JSON.parse((await kvGet(env, `job:${id}`)) || "null"); } catch { job = null; }
      if (job && job.device && hasDevice && job.device !== device) {
        return json({ error: "This job belongs to another device.", code: "owner" }, 403);
      }
      const appPath = job?.model && job.model !== MODEL ? "fal-ai/qwen-image-edit" : APP;
      const ttl = job?.ttl || intEnv(env.RESULT_TTL_SECONDS, 900);

      let statusRes;
      try {
        statusRes = await falFetch(`${QUEUE}/${appPath}/requests/${id}/status`, {
          headers: { Authorization: `Key ${env.FAL_KEY}` }
        }, { timeoutMs: 12000, retries: 1 });
      } catch {
        return json({ error: "The AI service did not answer. Please retry.", code: "network" }, 502);
      }
      const statusData = await readJson(statusRes);
      if (!statusRes.ok) {
        return json({ error: errorMessage(statusData, statusRes.status, "Unable to check generation status."), code: "fal" }, statusRes.status);
      }

      if (statusData.status !== "COMPLETED") {
        return json({
          status: statusData.status || "IN_PROGRESS",
          queue_position: statusData.queue_position ?? null,
          creditsLeft: hasDevice ? (await getCredits(env, device)).credits : undefined
        });
      }

      // fal reports failures as COMPLETED + error.
      if (statusData.error) {
        if (hasDevice) await refundCredit(env, device);
        return json({
          status: "FAILED",
          error: errorMessage({ detail: statusData.error, error_type: statusData.error_type }, 0, "AI generation failed."),
          code: "failed"
        });
      }

      let resultRes;
      try {
        resultRes = await falFetch(`${QUEUE}/${appPath}/requests/${id}`, {
          headers: { Authorization: `Key ${env.FAL_KEY}` }
        }, { timeoutMs: 15000, retries: 1 });
      } catch {
        return json({ status: "FAILED", error: "Could not retrieve the generated image. Please retry.", code: "network" });
      }
      const result = await readJson(resultRes);
      if (!resultRes.ok) {
        return json({ status: "FAILED", error: errorMessage(result, resultRes.status, "Unable to retrieve the generated image."), code: "fal" });
      }
      if (result.has_nsfw_concepts?.[0]) {
        if (hasDevice) await refundCredit(env, device);
        return json({ status: "FAILED", error: "The AI safety filter blocked the result. Try a different photo.", code: "nsfw" });
      }

      const falUrl = result.images?.[0]?.url || result.image?.url || null;
      if (!falUrl) return json({ status: "FAILED", error: "The AI finished but returned no image.", code: "empty" });

      const key = await storeResult(env, falUrl, ttl);
      const imageUrl = key ? `https://${url.host}/api/result/${key}` : falUrl;

      return json({
        status: "COMPLETED",
        imageUrl,
        stored: Boolean(key),
        seed: result.seed ?? null,
        creditsLeft: hasDevice ? (await getCredits(env, device)).credits : undefined
      });
    }

    return json({ error: "Route not found.", code: "404" }, 404);
  },

  // Cron: delete expired previews from R2.
  async scheduled(event, env) {
    if (!env.RESULTS) return;
    const now = Date.now();
    let cursor;
    let deleted = 0;
    for (const prefix of ["results/", "masks/"]) {
      do {
        const list = await env.RESULTS.list({ prefix, cursor, limit: 500 });
        for (const obj of list.objects) {
          const expires = Number(obj.customMetadata?.expires || 0);
          if (!expires || expires < now) {
            await env.RESULTS.delete(obj.key);
            deleted += 1;
          }
        }
        cursor = list.truncated ? list.cursor : undefined;
      } while (cursor);
    }
    console.log(JSON.stringify({ kind: "cleanup", deleted }));
  }
};

/**
 * Wrap a fetch handler so it always settles to a Response.
 *
 * The runtime calls `fetch` asynchronously: the handler must return a Promise
 * and that Promise must resolve to a `Response`. If it returns anything else,
 * or throws, the caller gets a 500 body like "Callback returned incorrect type;
 * expected 'Promise'" or "The script will never generate a response" and the
 * page cannot tell what happened. Catching here keeps the contract intact.
 */
function guardFetch(handler) {
  return async function fetch(request, env, ctx) {
    try {
      return await handler.call(worker, request, env, ctx);
    } catch (err) {
      // Message only: never log env, headers or the incoming body.
      console.error(JSON.stringify({ kind: "uncaught", message: String(err?.message || err).slice(0, 300) }));
      let corsOrigin = "*";
      try {
        const allowed = parseOrigins(env?.ALLOWED_ORIGIN);
        const origin = request?.headers?.get("Origin") || "";
        const openToAll = allowed.length === 0 || allowed.includes("*");
        corsOrigin = openToAll ? "*" : allowed.includes(origin) ? origin : allowed[0] || "*";
      } catch { /* keep "*" */ }
      return jsonResponse(
        { error: "Something went wrong on the server. Please try again.", code: "worker" },
        500,
        corsOrigin
      );
    }
  };
}

export default {
  fetch: guardFetch(worker.fetch),

  // Cron: delete expired previews from R2. A rejected scheduled event would be
  // reported as an unhandled rejection, so failures are logged and swallowed.
  async scheduled(event, env, ctx) {
    try {
      await worker.scheduled(event, env, ctx);
    } catch (err) {
      console.error(JSON.stringify({ kind: "cleanup_failed", message: String(err?.message || err).slice(0, 300) }));
    }
  }
};

// Exported for tests.
export const internals = {
  MODEL,
  MODEL_LEGACY,
  creditState,
  parseOrigins,
  sanitizePrompt,
  CREDIT_MAX,
  CREDIT_INTERVAL_MS
};
