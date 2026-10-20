import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Allowed dimension preset enum for FLUX.1-schnell on NVIDIA NIM
const FLUX_ALLOWED_DIMENSIONS = [
  768, 832, 896, 960, 1024, 1088, 1152, 1216, 1280, 1344,
];

function sanitizeDimension(val: unknown, fallback = 1024): number {
  const num = typeof val === "number" ? val : parseInt(String(val), 10);
  if (isNaN(num)) return fallback;
  // Pick closest allowed dimension
  return FLUX_ALLOWED_DIMENSIONS.reduce((prev, curr) =>
    Math.abs(curr - num) < Math.abs(prev - num) ? curr : prev,
  );
}

// In-memory sliding window rate limiter per user (max 15 requests / minute)
const rateLimitMap = new Map<string, number[]>();
function checkRateLimit(userId: string, limit = 15, windowMs = 60000): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(userId) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) return false;
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return true;
}

// Model configurations for NVIDIA NIM
const SUPPORTED_MODELS = {
  "flux-3-image-klein": {
    id: "flux-3-image-klein",
    label: "flux-3-image-klein",
    type: "Image" as const,
    endpoint: "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux-3-image-klein",
    buildBody: (prompt: string, opts?: { width?: number; height?: number; steps?: number; seed?: number }) => ({
      prompt,
      width: sanitizeDimension(opts?.width, 1024),
      height: sanitizeDimension(opts?.height, 1024),
      steps: Math.min(Math.max(opts?.steps || 25, 1), 50),
      seed: typeof opts?.seed === "number" && opts.seed >= 0 ? opts.seed : 0,
    }),
  },
  "flux.1-schnell": {
    id: "flux.1-schnell",
    label: "flux.1-schnell",
    type: "Image" as const,
    endpoint: "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
    buildBody: (prompt: string, opts?: { width?: number; height?: number; steps?: number; seed?: number }) => ({
      prompt,
      width: sanitizeDimension(opts?.width, 1024),
      height: sanitizeDimension(opts?.height, 1024),
      steps: Math.min(Math.max(opts?.steps || 4, 1), 4),
      seed: typeof opts?.seed === "number" && opts.seed >= 0 ? opts.seed : 0,
    }),
  },
  "sdxl-turbo": {
    id: "sdxl-turbo",
    label: "sdxl-turbo",
    type: "Image" as const,
    endpoint: "https://ai.api.nvidia.com/v1/genai/stabilityai/sdxl-turbo",
    buildBody: (prompt: string, opts?: { width?: number; height?: number; steps?: number; seed?: number }) => ({
      text_prompts: [{ text: prompt, weight: 1 }],
      width: 1024,
      height: 1024,
      steps: Math.min(Math.max(opts?.steps || 4, 1), 4),
      seed: typeof opts?.seed === "number" ? opts.seed : 0,
    }),
  },
  "stable-diffusion-3-medium": {
    id: "stable-diffusion-3-medium",
    label: "stable-diffusion-3-medium",
    type: "Image" as const,
    endpoint: "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium",
    buildBody: (prompt: string, opts?: { seed?: number }) => ({
      prompt,
      cfg_scale: 5,
      aspect_ratio: "1:1",
      seed: typeof opts?.seed === "number" ? opts.seed : 0,
      steps: 28,
      negative_prompt: "",
    }),
  },
  "nemotron-3-nano-omni": {
    id: "nemotron-3-nano-omni",
    label: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    type: "Text/Reasoning" as const,
    endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
    buildBody: (prompt: string) => ({
      model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      messages: [{ role: "user", content: prompt || "Hello" }],
      max_tokens: 100,
      temperature: 0.6,
      top_p: 0.95,
      chat_template_kwargs: {
        enable_thinking: true,
      },
    }),
  },
  "cosmos-video": {
    id: "cosmos-video",
    label: "cosmos-predict1-7b-image2world",
    type: "Video" as const,
    endpoint: "https://ai.api.nvidia.com/v1/genai/nvidia/cosmos-predict1-7b-image2world",
    buildBody: (prompt: string) => ({ prompt }),
  },
};

async function getApiKeyForUser(req: Request, bodyApiKey?: string): Promise<{ apiKey: string; userId: string }> {
  // 1. Authenticate user via JWT
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) throw new Error("Missing Authorization header");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) throw new Error("Unauthorized: Invalid session or JWT token");

  // 2. Caller-supplied key override (e.g. testing newly typed key in API Setup)
  if (bodyApiKey && typeof bodyApiKey === "string" && bodyApiKey.trim().length > 0) {
    return { apiKey: bodyApiKey.trim(), userId: user.id };
  }

  // 3. User's saved credentials in api_credentials table
  const { data: creds } = await supabase
    .from("api_credentials")
    .select("nvidia_api_key")
    .eq("user_id", user.id)
    .maybeSingle();

  if (creds?.nvidia_api_key && creds.nvidia_api_key.trim().length > 0) {
    return { apiKey: creds.nvidia_api_key.trim(), userId: user.id };
  }

  // 4. Server-side environment secret fallback
  const envKey = Deno.env.get("NVIDIA_API_KEY");
  if (envKey && envKey.trim().length > 0) {
    return { apiKey: envKey.trim(), userId: user.id };
  }

  throw new Error("NVIDIA_API_KEY not configured. Please add and save your key in API Setup.");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { apiKey, userId } = await getApiKeyForUser(req, body?.apiKey);

    if (!checkRateLimit(userId)) {
      return json({ error: "Rate limit exceeded. Please wait a minute before making more requests." }, 429);
    }

    const action = body.action || "generate_image";

    // -------------------------------------------------------------------------
    // ACTION: check_access
    // -------------------------------------------------------------------------
    if (action === "check_access") {
      const now = new Date().toISOString();
      const modelKeys = Object.keys(SUPPORTED_MODELS) as (keyof typeof SUPPORTED_MODELS)[];

      const results = await Promise.all(
        modelKeys.map(async (key) => {
          const m = SUPPORTED_MODELS[key];
          if (m.type === "Video") {
            // Deprecated Cosmos endpoint returns 404
            return {
              id: m.id,
              label: m.label,
              type: m.type,
              endpoint: m.endpoint,
              httpStatus: 404,
              status: "Endpoint Unavailable",
              access: "denied",
              reason: "NVIDIA Cosmos video endpoint is deprecated / retired.",
              lastChecked: now,
            };
          }

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15000);

          try {
            const probePayload =
              m.id === "flux.1-schnell" || m.id === "flux-3-image-klein"
                ? { prompt: "probe", width: 512, height: 512, steps: 1 }
                : m.buildBody("test prompt", {
                    width: 1024,
                    height: 1024,
                    steps: 4,
                    seed: 0,
                  });

            const res = await fetch(m.endpoint, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify(probePayload),
              signal: controller.signal,
            });

            const text = (await res.text()).slice(0, 300);
            let status = "Endpoint Unavailable";
            let access = "denied";
            let reason = "";

            if (res.status === 200) {
              status = "Available";
              access = "granted";
              reason = "Model is available and ready for inference.";
            } else if (res.status === 503) {
              status = "Available";
              access = "granted";
              reason = "Authorized. High NVIDIA worker demand (HTTP 503), model ready for requests.";
            } else if (res.status === 401) {
              status = "Access Denied";
              access = "invalid_key";
              reason = "Invalid NVIDIA API key or authorization token.";
            } else if (res.status === 403) {
              status = "Access Denied";
              access = "denied";
              reason = text.includes("Authorization failed")
                ? "Authorization failed for this model."
                : "Model not enabled on your NVIDIA account. Accept license terms at build.nvidia.com.";
            } else if (res.status === 404) {
              status = "Access Denied";
              access = "denied";
              reason = text.includes("Not found for account")
                ? "Model not enabled on your NVIDIA account."
                : "Model endpoint returned 404 Not Found.";
            } else if (res.status === 422) {
              status = "Invalid Request";
              access = "granted"; // Endpoint is reachable and user is authenticated
              reason = `Parameters rejected by schema: ${text.slice(0, 100)}`;
            } else if (res.status === 429) {
              status = "Rate Limited";
              access = "denied";
              reason = "NVIDIA rate limit reached (HTTP 429).";
            } else if (res.status === 402) {
              status = "Access Denied";
              access = "denied";
              reason = "NVIDIA account credits exhausted (HTTP 402).";
            } else {
              status = "Endpoint Unavailable";
              access = "unknown";
              reason = `HTTP ${res.status}: ${text.slice(0, 100)}`;
            }

            return {
              id: m.id,
              label: m.label,
              type: m.type,
              endpoint: m.endpoint,
              httpStatus: res.status,
              status,
              access,
              reason,
              lastChecked: now,
            };
          } catch (err: any) {
            return {
              id: m.id,
              label: m.label,
              type: m.type,
              endpoint: m.endpoint,
              httpStatus: 0,
              status: "Endpoint Unavailable",
              access: "unknown",
              reason: err?.message?.includes("aborted")
                ? "Request timed out after 15s."
                : `Network error: ${err?.message || "unreachable"}`,
              lastChecked: now,
            };
          } finally {
            clearTimeout(timer);
          }
        }),
      );

      const allGranted = results.some((r) => r.access === "granted");
      return json({ ok: allGranted, results });
    }

    // -------------------------------------------------------------------------
    // ACTION: generate_image
    // -------------------------------------------------------------------------
    if (action === "generate_image") {
      const { prompt, model = "flux-3-image-klein", width, height, steps, seed } = body;
      if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return json({ error: "A descriptive text prompt is required." }, 400);
      }

      const candidateModels = [
        model,
        "flux-3-image-klein",
        "flux.1-schnell",
      ].filter((m, idx, arr) => arr.indexOf(m) === idx);

      let lastErr = "";
      for (const candidate of candidateModels) {
        const modelConfig = SUPPORTED_MODELS[candidate as keyof typeof SUPPORTED_MODELS];
        if (!modelConfig || modelConfig.type !== "Image") continue;

        const requestPayload = modelConfig.buildBody(prompt.trim(), {
          width,
          height,
          steps: candidate === "flux-3-image-klein" ? (steps || 25) : steps,
          seed,
        });

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60000);

        try {
          const res = await fetch(modelConfig.endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify(requestPayload),
            signal: controller.signal,
          });

          if (!res.ok) {
            const errText = (await res.text()).slice(0, 400);
            if (res.status === 401) {
              return json({ error: "Invalid NVIDIA API key. Please update your key in API Setup." }, 401);
            }
            if (res.status === 402) {
              return json({ error: "NVIDIA account credits exhausted. Top up your account at build.nvidia.com." }, 402);
            }
            lastErr = `${modelConfig.label} failed (${res.status}): ${errText}`;
            console.warn(`Model ${candidate} failed (${res.status}), trying next candidate...`);
            continue;
          }

          const data = await res.json();
          const base64 =
            data?.artifacts?.[0]?.base64 ||
            data?.image ||
            data?.data?.[0]?.b64_json ||
            data?.b64_json;
          const imageUrl = data?.artifacts?.[0]?.url || data?.data?.[0]?.url || data?.url;

          if (imageUrl && typeof imageUrl === "string" && imageUrl.startsWith("http")) {
            return json({ ok: true, imageUrl, model: modelConfig.id });
          }

          if (base64 && typeof base64 === "string") {
            return json({
              ok: true,
              imageUrl: `data:image/png;base64,${base64}`,
              model: modelConfig.id,
            });
          }
        } catch (err: any) {
          lastErr = err?.message || "Unknown error";
          console.warn(`Model ${candidate} error:`, lastErr);
        } finally {
          clearTimeout(timer);
        }
      }

      return json({ error: lastErr || "NVIDIA image generation timed out or model unavailable." }, 200);
    }

    // -------------------------------------------------------------------------
    // ACTION: chat_completion (multimodal vision & chat on integrate.api.nvidia.com)
    // -------------------------------------------------------------------------
    if (action === "chat_completion") {
      const {
        model = "stepfun-ai/step-5-preview",
        messages,
        max_tokens = 4096,
        temperature = 0.5,
        top_p = 1,
      } = body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return json({ error: "Messages array is required." }, 400);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000);

      try {
        const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens,
            temperature,
            top_p,
            stream: false,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = (await res.text()).slice(0, 400);
          return json({ error: `NVIDIA Chat/Vision API error (${res.status}): ${errText}` }, res.status);
        }

        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content || "";
        return json({ ok: true, content, data, model });
      } catch (err: any) {
        if (err?.message?.includes("aborted")) {
          return json({ error: "NVIDIA chat request timed out after 60s." }, 504);
        }
        return json({ error: `NVIDIA chat error: ${err?.message || "Unknown error"}` }, 500);
      } finally {
        clearTimeout(timer);
      }
    }

    // -------------------------------------------------------------------------
    // ACTION: generate_video
    // -------------------------------------------------------------------------
    if (action === "generate_video") {
      // Deprecated Cosmos model has been retired by NVIDIA
      return json(
        {
          error:
            "NVIDIA Cosmos image-to-video cloud NIM endpoint is deprecated and not publicly hosted. Use the animated promo video engine instead.",
        },
        200,
      );
    }

    return json({ error: `Unsupported action '${action}'` }, 200);
  } catch (err: any) {
    return json({ error: err?.message || "Internal Server Error" }, 200);
  }
});
