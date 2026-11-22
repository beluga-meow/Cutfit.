// Cutfit AI API: Cloudflare Worker -> fal.ai (Qwen Image Edit)
//
// Routes
//   GET  /api/health          open it in a browser to test your setup
//   POST /api/try-on          { imageDataUrl, hairstyle } -> { success, request_id }
//   GET  /api/status?id=ID    -> { status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED", imageUrl?, error? }
//
// Worker settings (Cloudflare dashboard > your Worker > Settings > Variables and Secrets)
//   FAL_KEY         (Secret) your fal.ai API key
//   ALLOWED_ORIGIN  (Text)   your site, e.g. https://yourname.github.io
//                            Domain only: no /repo-name and no trailing slash.
//                            Several sites: separate with commas. Empty = any site.

const MODEL = "fal-ai/qwen-image-edit/image-to-image";
// fal status/result URLs use only owner/app. The full model path returns 405.
const APP = MODEL.split("/").slice(0, 2).join("/");
const QUEUE = "https://queue.fal.run";

// The page should shrink photos to about 1024px JPEG (a few hundred KB) before sending.
const MAX_DATA_URL_CHARS = 12 * 1024 * 1024;
const IMAGE_PREFIX = /^data:image\/(png|jpe?g|webp);base64,/i;
const REQUEST_ID = /^[A-Za-z0-9_-]{8,80}$/;

const CORS = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

const FRIENDLY = {
  content_policy_violation: "The AI safety filter blocked this photo. Try a different, clear photo of a face.",
  image_too_large: "This photo is too large. Try a smaller one.",
  image_too_small: "This photo is too small. Try a bigger one.",
  image_load_error: "The AI could not open this photo. Try a JPG or PNG.",
  unsupported_image_format: "Unsupported photo format. Use JPG, PNG or WebP.",
  file_too_large: "This photo file is too large. Try a smaller one.",
  no_media_generated: "The AI did not return an image. Try again or use another photo.",
  face_detection_error: "No face was found in the photo. Use a clear, front-facing photo."
};

function jsonResponse(data, status, corsOrigin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      "Access-Control-Allow-Origin": corsOrigin,
      "Vary": "Origin",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

// "https://me.github.io/" or "https://me.github.io/repo" -> "https://me.github.io"
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

// fal errors can be a string, an array of objects, or an object. Always return a readable string.
function errorMessage(data, status, fallback) {
  const d = data?.detail ?? data?.error ?? data?.message;
  const type = (Array.isArray(d) ? d[0]?.type : null) || data?.error_type || data?.type;
  if (type && FRIENDLY[type]) return FRIENDLY[type];

  let text = "";
  if (typeof d === "string") text = d;
  else if (Array.isArray(d)) text = d.map((x) => x?.msg || x?.message).filter(Boolean).join(" ");
  else if (d && typeof d === "object") text = d.message || "";
  text = text.slice(0, 300);

  if (status === 401) return "fal.ai rejected the API key. Check the FAL_KEY secret in your Worker.";
  if (status === 403) return "fal.ai refused the request" + (text ? ": " + text : ". Check your fal.ai balance and API key.");
  if (status === 429) return "fal.ai is busy right now. Wait a moment and try again.";
  return text || fallback;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = parseOrigins(env.ALLOWED_ORIGIN);
    const openToAll = allowed.length === 0 || allowed.includes("*");
    const originOk = openToAll || !origin || allowed.includes(origin);
    const corsOrigin = openToAll ? "*" : origin || allowed[0];
    const json = (data, status = 200) => jsonResponse(data, status, corsOrigin);

    // Let the preflight pass so the page can read the clear error below instead of "Failed to fetch".
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...CORS, "Access-Control-Allow-Origin": corsOrigin, "Vary": "Origin" }
      });
    }

    if (!originOk) {
      return json({ error: `Origin not allowed: ${origin}. Set ALLOWED_ORIGIN in the Worker to exactly ${origin}` }, 403);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if ((path === "/api/health" || path === "/") && request.method === "GET") {
      return json({
        ok: true,
        service: "CutFit AI API",
        message: "Backend is running",
        hasFalKey: Boolean(env.FAL_KEY),
        model: MODEL
      });
    }

    if (!env.FAL_KEY) {
      return json({ error: "FAL_KEY secret is missing in the Worker settings." }, 500);
    }

    // 1) Start a generation
    if (path === "/api/try-on" && request.method === "POST") {
      try {
        let body;
        try { body = await request.json(); } catch { return json({ error: "Invalid request body." }, 400); }
        const { imageDataUrl, hairstyle } = body || {};

        if (typeof imageDataUrl !== "string" || !IMAGE_PREFIX.test(imageDataUrl.slice(0, 40))) {
          return json({ error: "Please provide a valid image (PNG, JPEG or WebP)." }, 400);
        }
        if (imageDataUrl.length > MAX_DATA_URL_CHARS) {
          return json({ error: "Image is too large. Please use a smaller photo." }, 413);
        }
        if (typeof hairstyle !== "string" || !hairstyle.trim() || hairstyle.length > 240) {
          return json({ error: "Please select a valid hairstyle." }, 400);
        }

        const style = hairstyle.replace(/[\u0000-\u001f"`<>{}\\]/g, " ").replace(/\s+/g, " ").trim();
        const prompt = `Edit the uploaded portrait photo to realistically change only the person's hairstyle to: ${style}. Preserve the person's facial identity, face shape, eyes, nose, mouth, skin tone, expression, age appearance, pose, clothing, background, and lighting. Replace only the hair with a natural, realistic version of that hairstyle. Make the hair blend naturally with the person's head and hairline. Do not change the face or add accessories.`;

        const falRes = await fetch(`${QUEUE}/${MODEL}`, {
          method: "POST",
          headers: { "Authorization": `Key ${env.FAL_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, image_url: imageDataUrl, num_images: 1, output_format: "jpeg" })
        });
        const data = await readJson(falRes);
        if (!falRes.ok) {
          return json({ error: errorMessage(data, falRes.status, "AI generation request failed.") }, falRes.status);
        }
        if (!data.request_id) {
          return json({ error: "fal.ai did not return a request ID." }, 502);
        }
        return json({ success: true, request_id: data.request_id });
      } catch (error) {
        return json({ error: error?.message || "Unable to submit hairstyle request." }, 500);
      }
    }

    // 2) Poll for the result
    if (path === "/api/status" && request.method === "GET") {
      try {
        const id = url.searchParams.get("id") || "";
        if (!REQUEST_ID.test(id)) return json({ error: "Missing or invalid request ID." }, 400);

        const headers = { "Authorization": `Key ${env.FAL_KEY}` };
        const statusRes = await fetch(`${QUEUE}/${APP}/requests/${id}/status`, { headers });
        const statusData = await readJson(statusRes);
        if (!statusRes.ok) {
          return json({ error: errorMessage(statusData, statusRes.status, "Unable to check generation status.") }, statusRes.status);
        }

        if (statusData.status !== "COMPLETED") {
          return json({ status: statusData.status || "IN_PROGRESS", queue_position: statusData.queue_position ?? null });
        }

        // fal has no FAILED status: a failed job is COMPLETED with an "error" field.
        if (statusData.error) {
          return json({ status: "FAILED", error: errorMessage({ detail: statusData.error, error_type: statusData.error_type }, 0, "AI generation failed.") });
        }

        const resultRes = await fetch(`${QUEUE}/${APP}/requests/${id}`, { headers });
        const result = await readJson(resultRes);
        if (!resultRes.ok) {
          return json({ status: "FAILED", error: errorMessage(result, resultRes.status, "Unable to retrieve the generated image.") });
        }
        if (result.has_nsfw_concepts?.[0]) {
          return json({ status: "FAILED", error: "The AI safety filter blocked the result. Try a different photo." });
        }

        const imageUrl = result.images?.[0]?.url || result.image?.url || null;
        if (!imageUrl) {
          return json({ status: "FAILED", error: "The AI finished but returned no image. Try another photo." });
        }
        return json({ status: "COMPLETED", imageUrl });
      } catch (error) {
        return json({ error: error?.message || "Unable to check request status." }, 500);
      }
    }

    return json({ error: "Route not found." }, 404);
  }
};
