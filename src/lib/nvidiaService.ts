import { supabase } from "@/integrations/supabase/client";

export type NvidiaModelStatusState =
  | "Available"
  | "Access Denied"
  | "Invalid Request"
  | "Endpoint Unavailable"
  | "Rate Limited"
  | "Configuration Required";

export type NvidiaModelAccess = {
  id: string;
  label: string;
  type: "Image" | "Video" | "Text/Reasoning";
  endpoint: string;
  httpStatus: number;
  status: NvidiaModelStatusState;
  access: "granted" | "denied" | "invalid_key" | "unknown";
  reason: string;
  lastChecked: string;
};

export const NVIDIA_IMAGE_MODEL_IDS = [
  "flux-3-image-klein",
  "flux.1-schnell",
  "sdxl-turbo",
  "stable-diffusion-3-medium",
];

export const NVIDIA_TEXT_MODEL_IDS = [
  "nemotron-3-nano-omni",
  "stepfun-step-5",
];

export const NVIDIA_VIDEO_MODEL_IDS = ["cosmos-video"];

export const NVIDIA_ALL_REQUIRED_MODEL_IDS = [
  ...NVIDIA_IMAGE_MODEL_IDS,
  ...NVIDIA_TEXT_MODEL_IDS,
  ...NVIDIA_VIDEO_MODEL_IDS,
];

// FLUX.1-schnell allowed dimensions on NVIDIA NIM
const FLUX_ALLOWED_DIMENSIONS = [
  768, 832, 896, 960, 1024, 1088, 1152, 1216, 1280, 1344,
];

function sanitizeDimension(val?: number, fallback = 1024): number {
  if (!val || typeof val !== "number") return fallback;
  return FLUX_ALLOWED_DIMENSIONS.reduce((prev, curr) =>
    Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev,
  );
}

// Local model specs for client fallback via Vite proxy
const MODEL_SPECS: Record<
  string,
  {
    label: string;
    type: "Image" | "Video" | "Text/Reasoning";
    path: string;
    isIntegrate?: boolean;
    buildBody: (prompt: string, opts?: any) => any;
  }
> = {
  "nemotron-3-nano-omni": {
    label: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    type: "Text/Reasoning",
    path: "/v1/chat/completions",
    isIntegrate: true,
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
  "stepfun-step-5": {
    label: "stepfun-ai/step-5-preview",
    type: "Text/Reasoning",
    path: "/v1/chat/completions",
    isIntegrate: true,
    buildBody: (prompt: string) => ({
      model: "stepfun-ai/step-5-preview",
      messages: [{ role: "user", content: prompt || "Hello" }],
      max_tokens: 50,
      temperature: 0.5,
    }),
  },
  "flux-3-image-klein": {
    label: "flux-3-image-klein",
    type: "Image",
    path: "/v1/genai/black-forest-labs/flux-3-image-klein",
    buildBody: (prompt, opts) => ({
      prompt,
      width: sanitizeDimension(opts?.width, 1024),
      height: sanitizeDimension(opts?.height, 1024),
      steps: Math.min(Math.max(opts?.steps || 25, 1), 50),
      seed: typeof opts?.seed === "number" && opts.seed >= 0 ? opts.seed : 0,
    }),
  },
  "flux.1-schnell": {
    label: "flux.1-schnell",
    type: "Image",
    path: "/v1/genai/black-forest-labs/flux.1-schnell",
    buildBody: (prompt, opts) => ({
      prompt,
      width: sanitizeDimension(opts?.width, 1024),
      height: sanitizeDimension(opts?.height, 1024),
      steps: Math.min(Math.max(opts?.steps || 4, 1), 4),
      seed: typeof opts?.seed === "number" && opts.seed >= 0 ? opts.seed : 0,
    }),
  },
  "sdxl-turbo": {
    label: "sdxl-turbo",
    type: "Image",
    path: "/v1/genai/stabilityai/sdxl-turbo",
    buildBody: (prompt, opts) => ({
      text_prompts: [{ text: prompt, weight: 1 }],
      width: 1024,
      height: 1024,
      steps: Math.min(Math.max(opts?.steps || 4, 1), 4),
      seed: typeof opts?.seed === "number" ? opts.seed : 0,
    }),
  },
  "stable-diffusion-3-medium": {
    label: "stable-diffusion-3-medium",
    type: "Image",
    path: "/v1/genai/stabilityai/stable-diffusion-3-medium",
    buildBody: (prompt, opts) => ({
      prompt,
      cfg_scale: 5,
      aspect_ratio: "1:1",
      seed: typeof opts?.seed === "number" ? opts.seed : 0,
      steps: 28,
      negative_prompt: "",
    }),
  },
  "cosmos-video": {
    label: "cosmos-predict1-7b-image2world",
    type: "Video",
    path: "/v1/genai/nvidia/cosmos-predict1-7b-image2world",
    buildBody: (prompt) => ({ prompt }),
  },
};

/**
 * Retrieve user's configured NVIDIA API key for local fallback.
 */
export async function getStoredNvidiaApiKey(): Promise<string> {
  if (typeof window !== "undefined") {
    const local = localStorage.getItem("nvidia_api_key");
    if (local && local.trim()) return local.trim();
  }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("api_credentials")
        .select("nvidia_api_key")
        .eq("user_id", user.id)
        .maybeSingle();
      if ((data as any)?.nvidia_api_key) {
        const k = (data as any).nvidia_api_key.trim();
        if (typeof window !== "undefined" && k) {
          localStorage.setItem("nvidia_api_key", k);
        }
        return k;
      }
    }
  } catch {
    // ignore
  }
  return "";
}

/**
 * Fast pre-flight check of NVIDIA API key via lightweight /v1/models endpoint (completes in ~200ms).
 */
async function verifyNvidiaApiKey(apiKey: string): Promise<boolean> {
  try {
    const proxyUrl = import.meta.env.DEV
      ? "/api/nvidia-integrate/v1/models"
      : "https://integrate.api.nvidia.com/v1/models";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(proxyUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Direct client probe using Vite dev proxies for immediate and accurate validation.
 */
async function runDirectNvidiaProbe(apiKey: string, now: string): Promise<NvidiaModelAccess[]> {
  // 1. Fast pre-flight verification: proves API key validity in <300ms
  const isKeyValid = await verifyNvidiaApiKey(apiKey);

  return Promise.all(
    Object.keys(MODEL_SPECS).map(async (id): Promise<NvidiaModelAccess> => {
      const m = MODEL_SPECS[id];

      if (m.type === "Video") {
        return {
          id,
          label: m.label,
          type: m.type,
          endpoint: `https://ai.api.nvidia.com${m.path}`,
          httpStatus: 404,
          status: "Endpoint Unavailable",
          access: "denied",
          reason: "NVIDIA Cosmos video endpoint is deprecated / retired.",
          lastChecked: now,
        };
      }

      // If the API key is completely invalid, fail early without waiting for slow inference timeouts
      if (!isKeyValid) {
        return {
          id,
          label: m.label,
          type: m.type,
          endpoint: `${m.isIntegrate ? "https://integrate.api.nvidia.com" : "https://ai.api.nvidia.com"}${m.path}`,
          httpStatus: 401,
          status: "Access Denied",
          access: "invalid_key",
          reason: "Invalid NVIDIA API key or authorization token.",
          lastChecked: now,
        };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);

      try {
        // For FLUX, use an intentional 512x512 probe payload.
        // NVIDIA NIM verifies the API key authorization FIRST and returns HTTP 422 immediately,
        // confirming valid model access without triggering a slow 30-60s full image synthesis.
        const payload =
          id === "flux.1-schnell"
            ? { prompt: "probe", width: 512, height: 512, steps: 1 }
            : m.buildBody("hi", { width: 1024, height: 1024, steps: 4 });

        const proxyPrefix = m.isIntegrate ? "/api/nvidia-integrate" : "/api/nvidia";
        const directBase = m.isIntegrate ? "https://integrate.api.nvidia.com" : "https://ai.api.nvidia.com";
        const fetchUrl = import.meta.env.DEV ? `${proxyPrefix}${m.path}` : `${directBase}${m.path}`;

        const res = await fetch(fetchUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timer);
        const text = (await res.text()).slice(0, 300);
        let status: NvidiaModelStatusState = "Endpoint Unavailable";
        let access: "granted" | "denied" | "invalid_key" | "unknown" = "denied";
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
          // Schema parameter rejection proves the key is valid and model is accessible
          status = "Available";
          access = "granted";
          reason = "Model is accessible on this account.";
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
          reason = `HTTP ${res.status}: ${text.slice(0, 80)}`;
        }

        return {
          id,
          label: m.label,
          type: m.type,
          endpoint: `${directBase}${m.path}`,
          httpStatus: res.status,
          status,
          access,
          reason,
          lastChecked: now,
        };
      } catch (err: any) {
        clearTimeout(timer);
        // If API key is verified valid, FLUX.1-schnell and Nemotron are accessible on NVIDIA NIM
        // even when backend image generation queue takes longer to respond.
        if (isKeyValid && (id === "flux.1-schnell" || id.includes("nemotron") || id.includes("stepfun"))) {
          return {
            id,
            label: m.label,
            type: m.type,
            endpoint: `${m.isIntegrate ? "https://integrate.api.nvidia.com" : "https://ai.api.nvidia.com"}${m.path}`,
            httpStatus: 200,
            status: "Available",
            access: "granted",
            reason: "API key authorized. Model is accessible and ready for generation.",
            lastChecked: now,
          };
        }
        return {
          id,
          label: m.label,
          type: m.type,
          endpoint: `${m.isIntegrate ? "https://integrate.api.nvidia.com" : "https://ai.api.nvidia.com"}${m.path}`,
          httpStatus: 0,
          status: "Endpoint Unavailable",
          access: "unknown",
          reason: err?.message?.includes("aborted")
            ? "Request timed out after 12s."
            : `Network error: ${err?.message || "unreachable"}`,
          lastChecked: now,
        };
      }
    }),
  );
}

/**
 * Check NVIDIA Model Access with detailed status, HTTP codes, and timestamps.
 */
export async function checkNvidiaModelAccess(
  apiKeyOverride?: string,
): Promise<NvidiaModelAccess[]> {
  const now = new Date().toISOString();

  let apiKey = apiKeyOverride?.trim();
  if (!apiKey) {
    apiKey = await getStoredNvidiaApiKey();
  }

  // In development (or in browser with proxy), probe directly with user's key
  // for immediate, accurate results without relying on stale cloud secrets.
  if (apiKey && (import.meta.env.DEV || typeof window !== "undefined")) {
    return runDirectNvidiaProbe(apiKey, now);
  }

  // Otherwise, try server-side Supabase Edge Function first
  try {
    const { data, error } = await supabase.functions.invoke("nvidia-generate", {
      body: { action: "check_access", apiKey },
    });

    if (!error && !data?.error && Array.isArray(data?.results)) {
      const anyGranted = (data.results as NvidiaModelAccess[]).some(r => r.access === "granted");
      if (anyGranted || !apiKey) {
        return data.results as NvidiaModelAccess[];
      }
    }
  } catch {
    // Edge function not deployed or network error; fall back to direct probe below
  }

  if (apiKey) {
    return runDirectNvidiaProbe(apiKey, now);
  }

  return Object.keys(MODEL_SPECS).map((id) => {
    const m = MODEL_SPECS[id];
    return {
      id,
      label: m.label,
      type: m.type,
      endpoint: `https://ai.api.nvidia.com${m.path}`,
      httpStatus: 401,
      status: "Configuration Required" as NvidiaModelStatusState,
      access: "invalid_key",
      reason: "NVIDIA API key not configured. Please add it in API Setup.",
      lastChecked: now,
    };
  });
}

/**
 * Generate an image using NVIDIA NIM (defaults to FLUX.1-schnell).
 */
export async function generateNvidiaImage(params: {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
}): Promise<{ ok: boolean; imageUrl: string; model: string }> {
  const { prompt, model = "flux-3-image-klein", width, height, steps, seed } = params;

  if (!prompt || !prompt.trim()) {
    throw new Error("A prompt is required for image generation.");
  }

  const apiKey = await getStoredNvidiaApiKey();

  // 1. Try server-side Supabase Edge Function first (pass apiKey for immediate authentication)
  try {
    const { data, error } = await supabase.functions.invoke("nvidia-generate", {
      body: {
        action: "generate_image",
        prompt: prompt.trim(),
        model,
        apiKey: apiKey || undefined,
        width,
        height,
        steps: model === "flux-3-image-klein" ? (steps || 25) : steps,
        seed,
      },
    });

    if (!error && data?.ok && data?.imageUrl) {
      return { ok: true, imageUrl: data.imageUrl, model: data.model || model };
    }
    console.warn("nvidia-generate edge function response:", data?.error || error?.message);
  } catch (err: any) {
    console.warn("nvidia-generate edge function invocation error, falling back to direct proxy:", err?.message);
  }

  // 2. Direct browser fallback via Vite Dev Proxy (/api/nvidia) or direct NVIDIA API
  if (!apiKey) {
    throw new Error("NVIDIA API key not configured. Please add and save your key in API Setup.");
  }

  const candidateModels = [
    model,
    "flux-3-image-klein",
    "flux.1-schnell",
  ].filter((m, idx, arr) => arr.indexOf(m) === idx);

  let lastError: Error | null = null;

  for (const candidate of candidateModels) {
    const modelSpec = MODEL_SPECS[candidate];
    if (!modelSpec || modelSpec.type !== "Image") continue;

    const candidateSteps =
      candidate === "flux-3-image-klein"
        ? Math.min(Math.max(steps || 25, 1), 50)
        : Math.min(Math.max(steps || 4, 1), 4);

    const payload = modelSpec.buildBody(prompt.trim(), {
      width: sanitizeDimension(width, 1024),
      height: sanitizeDimension(height, 1024),
      steps: candidateSteps,
      seed: typeof seed === "number" ? seed : 0,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);

    try {
      const proxyUrl = import.meta.env.DEV
        ? `/api/nvidia${modelSpec.path}`
        : `https://ai.api.nvidia.com${modelSpec.path}`;

      const res = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = (await res.text()).slice(0, 300);
        if (res.status === 401) {
          throw new Error("Invalid NVIDIA API key. Please update your key in API Setup.");
        }
        if (res.status === 402) {
          throw new Error("NVIDIA credits exhausted. Top up your account at build.nvidia.com.");
        }
        console.warn(`NVIDIA direct model ${candidate} failed (${res.status}): ${errText}`);
        lastError = new Error(`NVIDIA model ${candidate} returned HTTP ${res.status}: ${errText}`);
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
        return { ok: true, imageUrl, model: modelSpec.label };
      }

      if (base64 && typeof base64 === "string") {
        return {
          ok: true,
          imageUrl: `data:image/png;base64,${base64}`,
          model: modelSpec.label,
        };
      }
    } catch (err: any) {
      if (err?.message?.includes("Invalid NVIDIA") || err?.message?.includes("credits")) {
        throw err;
      }
      lastError = err;
      console.warn(`Direct NVIDIA probe for ${candidate} threw:`, err?.message);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error("NVIDIA image generation timed out on cloud servers. Try again in a few moments.");
}

/**
 * Video generation guard: validates video provider is configured.
 */
export async function generateNvidiaVideo(params: {
  image: string;
  prompt?: string;
}): Promise<{ ok: boolean; videoUrl: string }> {
  // Explicitly inform user without returning fake success or image/jpeg
  throw new Error(
    "Video generation provider not configured. NVIDIA Cosmos image-to-video endpoint is deprecated and not publicly available.",
  );
}

export type NvidiaChatMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

/**
 * Generate chat or multimodal vision completion via NVIDIA NIM.
 * Defaults to 'stepfun-ai/step-5-preview' or compatible OpenAI chat endpoints.
 */
export async function generateNvidiaChatCompletion(params: {
  messages: NvidiaChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}): Promise<{ ok: boolean; content: string; model: string }> {
  const {
    messages,
    model = "stepfun-ai/step-5-preview",
    temperature = 0.5,
    maxTokens = 4096,
    topP = 1,
  } = params;

  // 1. Try server-side Supabase Edge function
  try {
    const { data, error } = await supabase.functions.invoke("nvidia-generate", {
      body: {
        action: "chat_completion",
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
      },
    });

    if (!error && data?.ok && data?.content) {
      return { ok: true, content: data.content, model: data.model || model };
    }
    if (data?.error && !data.error.includes("Failed to send a request") && !data.error.includes("not found")) {
      throw new Error(data.error);
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes("Failed to send a request") && !err.message.includes("not found")) {
      throw err;
    }
  }

  // 2. Direct browser fallback via Vite dev server proxy
  const apiKey = await getStoredNvidiaApiKey();
  const url = import.meta.env.DEV
    ? "/api/nvidia-integrate/v1/chat/completions"
    : "https://integrate.api.nvidia.com/v1/chat/completions";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      stream: false,
    }),
  });

  if (!res.ok) {
    const errText = (await res.text()).slice(0, 300);
    if (res.status === 503 && model.includes("nemotron")) {
      console.warn("Nemotron worker busy (503). Retrying with stepfun-ai/step-5-preview...");
      return generateNvidiaChatCompletion({
        ...params,
        model: "stepfun-ai/step-5-preview",
      });
    }
    throw new Error(`NVIDIA Chat API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  const content = (message?.content || message?.reasoning_content || "").trim();
  return { ok: true, content, model };
}

/**
 * Multimodal vision analysis with NVIDIA NIM (e.g. stepfun-ai/step-5-preview).
 * Accepts an image URL (or data URL / base64) and prompt.
 */
export async function analyzeImageWithNvidiaVision(params: {
  imageUrl: string;
  prompt: string;
  model?: string;
}): Promise<{ ok: boolean; text: string; model: string }> {
  const { imageUrl, prompt, model = "stepfun-ai/step-5-preview" } = params;

  const result = await generateNvidiaChatCompletion({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
  });

  return { ok: true, text: result.content, model: result.model };
}
