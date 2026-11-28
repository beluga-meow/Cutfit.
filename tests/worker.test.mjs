// Worker route tests. No network, no wrangler: fetch is stubbed and the KV/R2
// bindings are small in-memory fakes.

import test from "node:test";
import assert from "node:assert/strict";
import worker, { internals } from "../index.js";

const ORIGIN = "https://beluga-meow.github.io";
const DEVICE = "device-abc12345";

function makeKV() {
  const map = new Map();
  return {
    map,
    async get(key) {
      const entry = map.get(key);
      if (!entry) return null;
      if (entry.expires && entry.expires < Date.now()) {
        map.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key, value, opts) {
      map.set(key, { value, expires: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : 0 });
    },
    async delete(key) {
      map.delete(key);
    }
  };
}

function makeR2() {
  const map = new Map();
  return {
    map,
    async put(key, value, opts) {
      map.set(key, { value, ...opts });
    },
    async get(key) {
      const entry = map.get(key);
      if (!entry) return null;
      return {
        body: new Blob([entry.value]).stream(),
        httpMetadata: entry.httpMetadata,
        customMetadata: entry.customMetadata
      };
    },
    async delete(key) {
      map.delete(key);
    },
    async list() {
      return { objects: [...map.entries()].map(([key, v]) => ({ key, customMetadata: v.customMetadata })), truncated: false };
    }
  };
}

function makeEnv(overrides = {}) {
  return {
    FAL_KEY: "test-key",
    ALLOWED_ORIGIN: ORIGIN,
    CREDITS: makeKV(),
    RESULTS: makeR2(),
    DAILY_CAP: "5",
    RESULT_TTL_SECONDS: "900",
    ...overrides
  };
}

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const MASK =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function req(path, { method = "GET", body, origin = ORIGIN, device = DEVICE, headers = {} } = {}) {
  return new Request(`https://api.example.com${path}`, {
    method,
    headers: {
      ...(origin ? { Origin: origin } : {}),
      ...(device ? { "X-Device-Id": device } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers
    },
    body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined
  });
}

/** Stub fal.ai: queue submit, status, result and image download. */
function stubFal({ status = "COMPLETED", failSubmit = false, pending = false } = {}) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    calls.push({ url, init });
    if (url.startsWith("https://queue.fal.run/") && init.method === "POST") {
      if (failSubmit) return new Response(JSON.stringify({ detail: "boom" }), { status: 500 });
      return new Response(JSON.stringify({ request_id: "req_12345678", queue_position: 0 }), { status: 200 });
    }
    if (url.endsWith("/status")) {
      return new Response(JSON.stringify({ status: pending ? "IN_PROGRESS" : status }), { status: 200 });
    }
    if (/\/requests\/req_12345678$/.test(url)) {
      return new Response(
        JSON.stringify({ images: [{ url: "https://fal.media/out.png", width: 1024, height: 1024 }], seed: 42 }),
        { status: 200 }
      );
    }
    if (url.startsWith("https://fal.media/")) {
      return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } });
    }
    return new Response("{}", { status: 404 });
  };
  return calls;
}

test.afterEach(() => {
  delete globalThis.fetch;
});

test("health reports configuration without leaking the key", async () => {
  const res = await worker.fetch(req("/api/health", { device: null, origin: null }), makeEnv());
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.hasFalKey, true);
  assert.equal(data.hasKV, true);
  assert.equal(data.model, internals.MODEL);
  assert.equal(JSON.stringify(data).includes("test-key"), false);
});

test("rejects unknown origins", async () => {
  const res = await worker.fetch(req("/api/health", { origin: "https://evil.example" }), makeEnv());
  assert.equal(res.status, 403);
});

test("preflight allows the configured origin", async () => {
  const res = await worker.fetch(req("/api/try-on", { method: "OPTIONS" }), makeEnv());
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
});

test("rejects a missing device id", async () => {
  const res = await worker.fetch(req("/api/try-on", { method: "POST", body: {}, device: null }), makeEnv());
  assert.equal(res.status, 400);
});

test("rejects a non-image payload", async () => {
  const res = await worker.fetch(
    req("/api/try-on", { method: "POST", body: { imageDataUrl: "https://example.com/x.png", maskDataUrl: MASK, prompt: "a haircut please" } }),
    makeEnv()
  );
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /valid image/i);
});

test("rejects an oversized upload before parsing", async () => {
  const huge = "data:image/png;base64," + "A".repeat(15 * 1024 * 1024);
  const res = await worker.fetch(req("/api/try-on", { method: "POST", body: { imageDataUrl: huge, maskDataUrl: MASK } }), makeEnv());
  assert.equal(res.status, 413);
});

test("rejects an invalid seed", async () => {
  const res = await worker.fetch(
    req("/api/try-on", { method: "POST", body: { imageDataUrl: PNG_1PX, maskDataUrl: MASK, prompt: "Give me a textured crop", seed: -1 } }),
    makeEnv()
  );
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /seed/i);
});

test("happy path submits the inpaint model, stores the result and reports credits", async () => {
  const env = makeEnv();
  const calls = stubFal();
  const res = await worker.fetch(
    req("/api/try-on", { method: "POST", body: { imageDataUrl: PNG_1PX, maskDataUrl: MASK, prompt: "Give me a textured crop", seed: 7 } }),
    env
  );
  const data = await res.json();
  assert.equal(res.status, 200, JSON.stringify(data));
  assert.equal(data.request_id, "req_12345678");
  assert.equal(data.creditsLeft, internals.CREDIT_MAX - 1);
  assert.equal(data.model, internals.MODEL);

  const submit = calls.find((c) => c.init.method === "POST");
  const payload = JSON.parse(submit.init.body);
  assert.equal(payload.mask_url, MASK);
  assert.equal(payload.seed, 7);
  assert.equal(payload.strength, 0.93);
  assert.ok(submit.url.includes(internals.MODEL));

  const statusRes = await worker.fetch(req("/api/status?id=req_12345678"), env);
  const status = await statusRes.json();
  assert.equal(status.status, "COMPLETED");
  assert.match(status.imageUrl, /\/api\/result\/[a-f0-9]{32}\.png$/);
  assert.equal(status.stored, true);

  const img = await worker.fetch(req(status.imageUrl.replace("https://api.example.com", ""), { device: null, origin: null }), env);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("Content-Type"), "image/png");
});

test("mask-less requests fall back to the legacy model for old pages", async () => {
  const calls = stubFal();
  const res = await worker.fetch(
    req("/api/try-on", { method: "POST", body: { imageDataUrl: PNG_1PX, hairstyle: "Korean two-block" } }),
    makeEnv()
  );
  assert.equal(res.status, 200);
  const submit = calls.find((c) => c.init.method === "POST");
  assert.ok(submit.url.includes(internals.MODEL_LEGACY));
});

test("fal submit failure refunds the credit", async () => {
  const env = makeEnv();
  stubFal({ failSubmit: true });
  const res = await worker.fetch(
    req("/api/try-on", { method: "POST", body: { imageDataUrl: PNG_1PX, maskDataUrl: MASK, prompt: "Give me a textured crop" } }),
    env
  );
  assert.equal(res.status, 500);
  const data = await res.json();
  assert.equal(data.creditsLeft, internals.CREDIT_MAX);
});

test("credits run out and return 402", async () => {
  const env = makeEnv({ DAILY_CAP: "999" });
  stubFal();
  // Start from an empty balance rather than firing ten requests, which would
  // hit the per-minute rate limiter first.
  await env.CREDITS.put(`credit:${DEVICE}`, JSON.stringify({ credits: 0, last: Date.now() }));

  const body = { imageDataUrl: PNG_1PX, maskDataUrl: MASK, prompt: "Give me a textured crop" };
  const blocked = await worker.fetch(req("/api/try-on", { method: "POST", body }), env);
  assert.equal(blocked.status, 402);
  assert.equal((await blocked.json()).code, "credits");

  const credits = await (await worker.fetch(req("/api/credits"), env)).json();
  assert.equal(credits.credits, 0);
});

test("per-minute rate limit returns 429 with Retry-After", async () => {
  const env = makeEnv({ DAILY_CAP: "999" });
  stubFal();
  const body = { imageDataUrl: PNG_1PX, maskDataUrl: MASK, prompt: "Give me a textured crop" };
  let response;
  for (let i = 0; i < 8; i += 1) {
    response = await worker.fetch(req("/api/try-on", { method: "POST", body }), env);
    if (response.status === 429) break;
  }
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
});

test("global daily cap stops spending", async () => {
  const env = makeEnv({ DAILY_CAP: "1" });
  stubFal();
  const body = { imageDataUrl: PNG_1PX, maskDataUrl: MASK, prompt: "Give me a textured crop" };
  const first = await worker.fetch(req("/api/try-on", { method: "POST", body }), env);
  assert.equal(first.status, 200);
  const second = await worker.fetch(req("/api/try-on", { method: "POST", body }), env);
  assert.equal(second.status, 503);
  assert.equal((await second.json()).code, "cap");
});

test("expired or unknown result keys return 410 / 404", async () => {
  const env = makeEnv();
  const missing = await worker.fetch(req(`/api/result/${"a".repeat(32)}.png`, { device: null, origin: null }), env);
  assert.equal(missing.status, 410);
  const bad = await worker.fetch(req("/api/result/../../etc/passwd", { device: null, origin: null }), env);
  assert.equal(bad.status, 404);
});

test("status rejects malformed ids and foreign jobs", async () => {
  const env = makeEnv();
  const bad = await worker.fetch(req("/api/status?id=abc"), env);
  assert.equal(bad.status, 400);

  env.CREDITS.map.set("job:req_12345678", { value: JSON.stringify({ device: "other-device-1" }) });
  const foreign = await worker.fetch(req("/api/status?id=req_12345678", { device: DEVICE }), env);
  assert.equal(foreign.status, 403);
});

test("pending jobs report IN_PROGRESS", async () => {
  const env = makeEnv();
  stubFal({ pending: true });
  await worker.fetch(
    req("/api/try-on", { method: "POST", body: { imageDataUrl: PNG_1PX, maskDataUrl: MASK, prompt: "Give me a textured crop" } }),
    env
  );
  const res = await worker.fetch(req("/api/status?id=req_12345678"), env);
  const data = await res.json();
  assert.equal(data.status, "IN_PROGRESS");
});

test("cron deletes expired previews", async () => {
  const env = makeEnv();
  await env.RESULTS.put("results/old.png", new Uint8Array([1]), { customMetadata: { expires: "1" } });
  await env.RESULTS.put("results/new.png", new Uint8Array([1]), { customMetadata: { expires: String(Date.now() + 60000) } });
  await worker.scheduled({}, env);
  assert.equal(env.RESULTS.map.has("results/old.png"), false);
  assert.equal(env.RESULTS.map.has("results/new.png"), true);
});

test("prompt sanitiser strips markup and control characters", () => {
  const cleaned = internals.sanitizePrompt('  <script>alert("x")</script>` back\\\\tick \u0007  ');
  assert.equal(/[<>`"\\]/.test(cleaned), false);
  assert.ok(cleaned.length <= 1400);
});

test("credit state refills over time and caps at the maximum", () => {
  const now = Date.now();
  const full = internals.creditState(null, now);
  assert.equal(full.credits, internals.CREDIT_MAX);

  const threeHoursLater = now + internals.CREDIT_INTERVAL_MS + 1000;
  const refilled = internals.creditState(JSON.stringify({ credits: 2, last: now }), threeHoursLater);
  assert.equal(refilled.credits, 3);

  const capped = internals.creditState(
    JSON.stringify({ credits: 9, last: now - 5 * internals.CREDIT_INTERVAL_MS }),
    now
  );
  assert.equal(capped.credits, internals.CREDIT_MAX);
});

test("analytics and log routes accept small payloads and reject huge ones", async () => {
  const env = makeEnv();
  const ok = await worker.fetch(req("/api/event", { method: "POST", body: { name: "boot" } }), env);
  assert.equal(ok.status, 200);
  const big = await worker.fetch(req("/api/event", { method: "POST", body: "x".repeat(3000) }), env);
  assert.equal(big.status, 413);
});

test("config advertises apiVersion 3 so the page knows the new routes exist", async () => {
  const res = await worker.fetch(req("/api/config", { device: null, origin: null }), makeEnv());
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.apiVersion, 3);
});

test("data-URL masks are used as-is when fal accepts them", async () => {
  const env = makeEnv();
  const calls = stubFal();
  const res = await worker.fetch(
    req("/api/try-on", { method: "POST", body: { imageDataUrl: PNG_1PX, maskDataUrl: MASK, prompt: "Give me a textured crop" } }),
    env
  );
  const data = await res.json();
  assert.equal(res.status, 200, JSON.stringify(data));
  assert.equal(data.maskSource, "data-url");
  assert.equal(calls.filter((c) => c.init.method === "POST").length, 1);
  assert.equal([...env.RESULTS.map.keys()].filter((k) => k.startsWith("masks/")).length, 0);
});

test("a rejected mask data URL is hosted in R2 and retried once", async () => {
  const env = makeEnv();
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    calls.push({ url, init });
    if (url.startsWith("https://queue.fal.run/") && init.method === "POST") {
      const payload = JSON.parse(init.body);
      if (String(payload.mask_url).startsWith("data:")) {
        return new Response(
          JSON.stringify({ detail: [{ loc: ["body", "mask_url"], msg: "Input should be a valid URL" }] }),
          { status: 422 }
        );
      }
      return new Response(JSON.stringify({ request_id: "req_hosted1", queue_position: 0 }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };

  const res = await worker.fetch(
    req("/api/try-on", { method: "POST", body: { imageDataUrl: PNG_1PX, maskDataUrl: MASK, prompt: "Give me a textured crop" } }),
    env
  );
  const data = await res.json();
  assert.equal(res.status, 200, JSON.stringify(data));
  assert.equal(data.maskSource, "r2");
  assert.equal(data.creditsLeft, internals.CREDIT_MAX - 1);

  const posts = calls.filter((c) => c.init.method === "POST");
  assert.equal(posts.length, 2);
  const hosted = JSON.parse(posts[1].init.body).mask_url;
  assert.match(hosted, /^https:\/\/api\.example\.com\/api\/mask\/[a-f0-9]{32}\.png$/);

  const keys = [...env.RESULTS.map.keys()].filter((k) => k.startsWith("masks/"));
  assert.equal(keys.length, 1);
  const entry = env.RESULTS.map.get(keys[0]);
  assert.equal(entry.httpMetadata.contentType, "image/png");
  assert.ok(Number(entry.customMetadata.expires) > Date.now());

  const served = await worker.fetch(req(`/api/mask/${keys[0].slice("masks/".length)}`, { device: null, origin: null }), env);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("Content-Type"), "image/png");
});

test("a mask rejection with no R2 binding still refunds and reports cleanly", async () => {
  const env = makeEnv({ RESULTS: undefined });
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    if (url.startsWith("https://queue.fal.run/") && init.method === "POST") {
      return new Response(JSON.stringify({ detail: "bad mask" }), { status: 422 });
    }
    return new Response("{}", { status: 404 });
  };
  const res = await worker.fetch(
    req("/api/try-on", { method: "POST", body: { imageDataUrl: PNG_1PX, maskDataUrl: MASK, prompt: "Give me a textured crop" } }),
    env
  );
  assert.equal(res.status, 422);
  assert.equal((await res.json()).creditsLeft, internals.CREDIT_MAX);
});

test("cron deletes expired masks as well as results", async () => {
  const env = makeEnv();
  await env.RESULTS.put("masks/old.png", new Uint8Array([1]), { customMetadata: { expires: "1" } });
  await env.RESULTS.put("masks/new.png", new Uint8Array([1]), { customMetadata: { expires: String(Date.now() + 60000) } });
  await worker.scheduled({}, env);
  assert.equal(env.RESULTS.map.has("masks/old.png"), false);
  assert.equal(env.RESULTS.map.has("masks/new.png"), true);
});

test("unknown mask keys are gone, not listed", async () => {
  const env = makeEnv();
  const missing = await worker.fetch(req(`/api/mask/${"b".repeat(32)}.png`, { device: null, origin: null }), env);
  assert.equal(missing.status, 410);
  const traversal = await worker.fetch(req("/api/mask/../../x", { device: null, origin: null }), env);
  assert.equal(traversal.status, 404);
});

// ------------------------------------- regression: the Error 1101 shutdown
//
// Production answered every request, including OPTIONS, with 500 / 1101 and
// "TypeError: Callback returned incorrect type; expected 'Promise'". That is the
// runtime saying the fetch handler did not hand back a Promise resolving to a
// Response. These tests pin the contract so the Worker can never regress to it.

test("fetch is an async function and every request settles to a Response", async () => {
  assert.equal(worker.fetch.constructor.name, "AsyncFunction", "fetch must be async");

  const env = makeEnv();
  const requests = [
    req("/api/health", { device: null, origin: null }),
    req("/api/config", { device: null, origin: null }),
    req("/api/try-on", { method: "OPTIONS" }),
    req("/api/try-on", { method: "POST", body: "not json at all" }),
    req("/api/status?id=abc"),
    req("/nope", { device: null, origin: null }),
    req(`/api/result/${"d".repeat(32)}.png`, { device: null, origin: null })
  ];

  for (const request of requests) {
    const pending = worker.fetch(request, env);
    assert.ok(pending instanceof Promise, `fetch(${request.url}) must return a Promise`);
    const res = await pending;
    assert.ok(res instanceof Response, `fetch(${request.url}) must resolve to a Response`);
    assert.ok(res.status < 500, `fetch(${request.url}) answered ${res.status}`);
  }
});

test("a thrown error inside the handler returns JSON 500 with a CORS header", async () => {
  const env = makeEnv();
  Object.defineProperty(env, "ALLOWED_ORIGIN", {
    get() {
      throw new Error("env is broken");
    }
  });

  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(" "));
  let res;
  try {
    res = await worker.fetch(req("/api/credits"), env);
  } finally {
    console.error = original;
  }

  assert.equal(res.status, 500, "no Error 1101: the handler still answers");
  assert.equal(res.headers.get("Content-Type"), "application/json; charset=utf-8");
  const data = await res.json();
  assert.equal(data.code, "worker");
  assert.equal(JSON.stringify(data).includes("env is broken"), false, "internals stay out of the response");
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*", "an unknown origin falls back to *");
  assert.equal(logged.length, 1);
  assert.match(logged[0], /env is broken/);
});

test("/api/health still answers 200 when KV, R2 and FAL_KEY are all absent", async () => {
  const res = await worker.fetch(req("/api/health", { device: null, origin: null }), { ALLOWED_ORIGIN: ORIGIN });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.hasKV, false);
  assert.equal(data.hasR2, false);
  assert.equal(data.hasFalKey, false);
});

test("a missing R2 binding is reported, not silently ignored", async () => {
  const env = makeEnv({ RESULTS: undefined });

  const result = await worker.fetch(req(`/api/result/${"e".repeat(32)}.png`, { device: null, origin: null }), env);
  assert.equal(result.status, 503);
  assert.match((await result.json()).error, /storage is not configured/i);

  const mask = await worker.fetch(req(`/api/mask/${"e".repeat(32)}.png`, { device: null, origin: null }), env);
  assert.equal(mask.status, 503);
});

test("without R2 a finished preview falls back to the fal URL and says so", async () => {
  const env = makeEnv({ RESULTS: undefined });
  stubFal();

  const start = await worker.fetch(
    req("/api/try-on", { method: "POST", body: { imageDataUrl: PNG_1PX, prompt: "Give me a textured crop" } }),
    env
  );
  assert.equal(start.status, 200);

  const status = await (await worker.fetch(req("/api/status?id=req_12345678"), env)).json();
  assert.equal(status.status, "COMPLETED");
  assert.equal(status.stored, false);
  assert.equal(status.imageUrl, "https://fal.media/out.png");
});

test("scheduled returns a Promise and never rejects", async () => {
  const empty = worker.scheduled({}, {});
  assert.ok(empty instanceof Promise);
  await empty;

  const env = makeEnv({
    RESULTS: {
      async list() {
        throw new Error("R2 is down");
      }
    }
  });
  const original = console.error;
  console.error = () => {};
  try {
    await worker.scheduled({ cron: "*/15 * * * *" }, env);
  } finally {
    console.error = original;
  }
});
