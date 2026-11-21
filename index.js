const MODEL = "fal-ai/qwen-image-edit/image-to-image";

const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Access-Control-Allow-Origin": origin || "*"
    }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "";
    const responseOrigin = allowedOrigin || origin || "*";

    if (request.method === "OPTIONS") {
      if (origin && allowedOrigin && origin !== allowedOrigin) {
        return json({ error: "Origin not allowed" }, 403, allowedOrigin);
      }
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          "Access-Control-Allow-Origin": responseOrigin
        }
      });
    }

    if (allowedOrigin && origin && origin !== allowedOrigin) {
      return json({ error: "Origin not allowed" }, 403, allowedOrigin);
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "CutFit AI API", message: "Backend is running" }, 200, responseOrigin);
    }

    if (!env.FAL_KEY) {
      return json({ error: "FAL_KEY secret is missing" }, 500, responseOrigin);
    }

    if (url.pathname === "/api/try-on" && request.method === "POST") {
      try {
        const body = await request.json();
        const { imageDataUrl, hairstyle } = body;

        if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
          return json({ error: "Please provide a valid image." }, 400, responseOrigin);
        }
        if (imageDataUrl.length > 18 * 1024 * 1024) {
          return json({ error: "Image is too large. Please use a smaller photo." }, 413, responseOrigin);
        }
        if (!hairstyle || typeof hairstyle !== "string" || hairstyle.length > 100) {
          return json({ error: "Please select a valid hairstyle." }, 400, responseOrigin);
        }

        const prompt = `Edit the uploaded portrait photo to realistically change only the person's hairstyle to ${hairstyle}. Preserve the person's facial identity, face shape, eyes, nose, mouth, skin tone, expression, age appearance, pose, clothing, background, and lighting. Replace only the hair with a natural, realistic ${hairstyle} haircut. Make the hair blend naturally with the person's head and hairline. Do not change the face or add accessories.`;

        const falResponse = await fetch(`https://queue.fal.run/${MODEL}`, {
          method: "POST",
          headers: {
            "Authorization": `Key ${env.FAL_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ image_url: imageDataUrl, prompt })
        });
        const result = await falResponse.json();
        if (!falResponse.ok) {
          return json({ error: result.detail || result.message || "AI generation request failed." }, falResponse.status, responseOrigin);
        }
        return json({ success: true, request_id: result.request_id }, 200, responseOrigin);
      } catch (error) {
        return json({ error: error.message || "Unable to submit hairstyle request." }, 500, responseOrigin);
      }
    }

    if (url.pathname === "/api/status" && request.method === "GET") {
      try {
        const requestId = url.searchParams.get("id");
        if (!requestId) return json({ error: "Missing request ID." }, 400, responseOrigin);

        const headers = { "Authorization": `Key ${env.FAL_KEY}` };
        const statusResponse = await fetch(`https://queue.fal.run/${MODEL}/requests/${encodeURIComponent(requestId)}/status`, { headers });
        const statusData = await statusResponse.json();
        if (!statusResponse.ok) {
          return json({ error: statusData.detail || "Unable to check generation status." }, statusResponse.status, responseOrigin);
        }

        if (statusData.status === "COMPLETED") {
          const resultResponse = await fetch(`https://queue.fal.run/${MODEL}/requests/${encodeURIComponent(requestId)}`, { headers });
          const result = await resultResponse.json();
          if (!resultResponse.ok) return json({ error: "Unable to retrieve generated image." }, resultResponse.status, responseOrigin);
          return json({ status: "COMPLETED", imageUrl: result.images?.[0]?.url || null }, 200, responseOrigin);
        }
        if (statusData.status === "FAILED") {
          return json({ status: "FAILED", error: statusData.error || "AI generation failed." }, 200, responseOrigin);
        }
        return json({ status: statusData.status || "IN_PROGRESS" }, 200, responseOrigin);
      } catch (error) {
        return json({ error: error.message || "Unable to check request status." }, 500, responseOrigin);
      }
    }

    return json({ error: "Route not found." }, 404, responseOrigin);
  }
};
