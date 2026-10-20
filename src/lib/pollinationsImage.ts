/**
 * Pollinations image client (ShreeTemplate AI image generation).
 *
 * Endpoints (verified live, 2026-09-23):
 *   - Unified: https://gen.pollinations.ai/image/{encodedPrompt}
 *       Full 79-model catalog (google/gemini-3-pro-image, ideogram-ai/ideogram-v4-quality,
 *       black-forest-labs/flux.2-pro, ...). Requires an API key (401 without one).
 *   - Legacy:  https://image.pollinations.ai/prompt/{encodedPrompt}
 *       No key required, but GET /models now returns only ["sana"] and the host
 *       rate limits aggressively (429). It does NOT serve flux any more, so asking
 *       for model=flux there silently produces unrelated/generic images.
 *
 * Guarantees implemented here:
 *   1. The user's prompt is sent VERBATIM. It is never rewritten, summarized,
 *      truncated or replaced with a template/campaign/title/preview prompt.
 *   2. The complete prompt is URL-encoded EXACTLY ONCE, and the built URL is
 *      verified to round-trip back to the original prompt.
 *   3. The model is always explicit - never silently swapped for another model.
 *      A model that cannot run on the active endpoint is reported as unavailable.
 *   4. enhance is never enabled (it rewrites the prompt before generation).
 *   5. Dimensions come from the strict size presets; huge images are rejected.
 *   6. negative_prompt is omitted entirely when empty.
 *   7. Seeds are random: Math.floor(Math.random() * 2147483647).
 *   8. Responses are validated (HTTP status, image content-type, non-empty,
 *      decodable) before anything is shown as success.
 *   9. API keys are NEVER logged and never placed in the request URL when a
 *      header works (the key is only used in the Authorization header).
 */

import { imageSizePresets } from "@/lib/imageSizePresets";

export type PollinationsEndpoint = "unified" | "legacy";

export const POLLINATIONS_MAX_SEED = 2147483647;
export const POLLINATIONS_UNIFIED_BASE = "https://gen.pollinations.ai/image";
export const POLLINATIONS_LEGACY_BASE = "https://image.pollinations.ai/prompt";
/** Above this the GET request URL is unsafe for proxies/CDNs - fail loudly, never truncate. */
export const POLLINATIONS_MAX_URL_LENGTH = 7500;

export interface PollinationsModelOption {
  /** Canonical model id sent to the API. */
  id: string;
  label: string;
  /** Endpoint that can actually serve this model. */
  endpoint: PollinationsEndpoint;
  /** True when the model renders typography well enough for commercial posters. */
  supportsTypography: boolean;
  requiresKey: boolean;
  note?: string;
}

/**
 * Curated "strongest first" catalog for commercial posters.
 * Models other than the legacy `sana` need a Pollinations API key because the
 * key-less legacy tier no longer serves them.
 */
export const POLLINATIONS_MODELS: PollinationsModelOption[] = [
  {
    id: "google/gemini-3-pro-image",
    label: "Nano Banana Pro (Gemini 3 Pro Image)",
    endpoint: "unified",
    supportsTypography: true,
    requiresKey: true,
    note: "Strongest prompt adherence + poster typography",
  },
  {
    id: "ideogram-ai/ideogram-v4-quality",
    label: "Ideogram 4.0 Quality",
    endpoint: "unified",
    supportsTypography: true,
    requiresKey: true,
    note: "Best-in-class text rendering in images",
  },
  {
    id: "black-forest-labs/flux.2-pro",
    label: "FLUX.2 Pro",
    endpoint: "unified",
    supportsTypography: true,
    requiresKey: true,
    note: "High-fidelity commercial product photography",
  },
  {
    id: "bytedance/seedream-5.0-pro",
    label: "Seedream 5.0 Pro",
    endpoint: "unified",
    supportsTypography: true,
    requiresKey: true,
  },
  {
    id: "community/chigwell/gpt-image-2.5",
    label: "GPT Image 2.5",
    endpoint: "unified",
    supportsTypography: true,
    requiresKey: true,
  },
  {
    id: "tongyi-mai/z-image-turbo",
    label: "Z-Image Turbo (Pollinations default)",
    endpoint: "unified",
    supportsTypography: false,
    requiresKey: true,
    note: "Fast/budget, weak at poster text",
  },
  {
    id: "sana",
    label: "Sana (free legacy tier)",
    endpoint: "legacy",
    supportsTypography: false,
    requiresKey: false,
    note: "Only model the free endpoint still serves; weak text rendering and rate limited",
  },
];

/** Model used when the active endpoint offers no user selection. */
export const DEFAULT_UNIFIED_POLLINATIONS_MODEL = "google/gemini-3-pro-image";
export const DEFAULT_LEGACY_POLLINATIONS_MODEL = "sana";

export function resolvePollinationsEndpoint(hasApiKey: boolean): PollinationsEndpoint {
  return hasApiKey ? "unified" : "legacy";
}

export function getPollinationsModel(id: string): PollinationsModelOption | undefined {
  return POLLINATIONS_MODELS.find((m) => m.id === id);
}

export function getModelsForEndpoint(endpoint: PollinationsEndpoint): PollinationsModelOption[] {
  return POLLINATIONS_MODELS.filter((m) => m.endpoint === endpoint);
}

export function getDefaultModelForEndpoint(endpoint: PollinationsEndpoint): string {
  return endpoint === "unified"
    ? DEFAULT_UNIFIED_POLLINATIONS_MODEL
    : DEFAULT_LEGACY_POLLINATIONS_MODEL;
}

/** A model is usable only when it exists, matches the active endpoint, and its key requirement is met. */
export function isPollinationsModelAvailable(
  modelId: string,
  endpoint: PollinationsEndpoint,
  hasApiKey: boolean
): boolean {
  const model = getPollinationsModel(modelId);
  if (!model) return false;
  if (model.endpoint !== endpoint) return false;
  return model.requiresKey ? hasApiKey : true;
}

// ---------------------------------------------------------------------------
// Request construction
// ---------------------------------------------------------------------------

export interface PollinationsRequestInput {
  /** The user's image prompt - sent verbatim. */
  prompt: string;
  model: string;
  width: number;
  height: number;
  endpoint: PollinationsEndpoint;
  seed?: number | null;
  quality?: "low" | "medium" | "high" | "hd";
  /** Only sent when it has real content - never "undefined"/"null"/"". */
  negativePrompt?: string | null;
  /** Bearer token for the unified endpoint. Never logged, never placed in the URL unless authMode is query. */
  apiKey?: string | null;
}

export interface PollinationsRequestDebug {
  provider: "pollinations";
  endpoint: PollinationsEndpoint;
  prompt: string;
  promptLength: number;
  model: string;
  width: number;
  height: number;
  seed: number;
  enhance: false;
  nologo: boolean;
  negativePromptSent: boolean;
  requestUrl: string;
  /** True when decoding the prompt segment of requestUrl returns the original prompt. */
  promptMatchesRequestUrl: boolean;
  promptDoubleEncoded: boolean;
  apiKeyConfigured: boolean;
  authMode?: "header" | "query" | "none";
  status?: number;
  contentType?: string | null;
  bytes?: number;
  durationMs?: number;
}

export type PollinationsErrorKind =
  | "model_unavailable"
  | "invalid_dimensions"
  | "prompt_too_long"
  | "unauthorized"
  | "rate_limited"
  | "provider_error"
  | "invalid_response"
  | "network";

export class PollinationsImageError extends Error {
  kind: PollinationsErrorKind;
  status?: number;

  constructor(kind: PollinationsErrorKind, message: string, status?: number) {
    super(message);
    this.name = "PollinationsImageError";
    this.kind = kind;
    this.status = status;
  }
}

/** Math.floor(Math.random() * 2147483647) - never Date.now(). */
export function createPollinationsSeed(): number {
  return Math.floor(Math.random() * POLLINATIONS_MAX_SEED);
}

export function normalizePollinationsSeed(seed?: number | null): number {
  if (seed === undefined || seed === null || !Number.isFinite(seed)) return createPollinationsSeed();
  return Math.max(0, Math.min(POLLINATIONS_MAX_SEED, Math.trunc(Math.abs(seed))));
}

/** Dimensions must match a strict preset - no provider defaults, no oversized requests. */
export function assertSupportedDimensions(
  width: number,
  height: number
): { width: number; height: number } {
  const match = imageSizePresets.find((p) => p.width === width && p.height === height);
  if (!match) {
    const allowed = imageSizePresets.map((p) => `${p.label} ${p.width}x${p.height}`).join(", ");
    throw new PollinationsImageError(
      "invalid_dimensions",
      `Unsupported image size ${width}x${height}. Allowed presets: ${allowed}.`
    );
  }
  return { width: match.width, height: match.height };
}

export interface BuiltPollinationsRequest {
  url: string;
  debug: PollinationsRequestDebug;
}

/**
 * Builds the exact Pollinations image URL/parameters.
 * The prompt is encoded once and the URL is verified to contain it verbatim.
 */
export function buildPollinationsImageRequest(input: PollinationsRequestInput): BuiltPollinationsRequest {
  const prompt = input.prompt.replace(/\r\n/g, "\n").trim();
  if (!prompt) {
    throw new PollinationsImageError("provider_error", "Image prompt is required.");
  }

  const { width, height } = assertSupportedDimensions(input.width, input.height);
  const model = input.model.trim();
  if (!model) {
    throw new PollinationsImageError("model_unavailable", "A Pollinations model must be selected.");
  }
  if (input.endpoint === "legacy" && model !== DEFAULT_LEGACY_POLLINATIONS_MODEL) {
    throw new PollinationsImageError(
      "model_unavailable",
      `Model "${model}" is not served by the free Pollinations endpoint (only "${DEFAULT_LEGACY_POLLINATIONS_MODEL}" is). ` +
        "Add a Pollinations API key to use it - the model is not switched automatically."
    );
  }

  const seed = normalizePollinationsSeed(input.seed);
  const hasApiKey = Boolean(input.apiKey && input.apiKey.length > 0);
  const encodedPrompt = encodeURIComponent(prompt); // the COMPLETE prompt, encoded exactly once

  const params = new URLSearchParams();
  params.set("model", model);
  params.set("width", String(width));
  params.set("height", String(height));
  params.set("seed", String(seed));

  const negativePrompt = typeof input.negativePrompt === "string" ? input.negativePrompt.trim() : "";
  const negativePromptSent = negativePrompt.length > 0;

  let nologo = false;
  if (input.endpoint === "legacy") {
    nologo = true;
    params.set("nologo", "true");
    // Legacy supports negative_prompt; omitted entirely when empty.
    if (negativePromptSent) params.set("negative_prompt", negativePrompt);
  } else if (input.quality) {
    // Unified endpoint documents: model, width, height, seed, quality, safe.
    // It is logo-free by default; enhance/negative_prompt do not exist there.
    params.set("quality", input.quality);
  }

  const base = input.endpoint === "unified" ? POLLINATIONS_UNIFIED_BASE : POLLINATIONS_LEGACY_BASE;
  const url = `${base}/${encodedPrompt}?${params.toString()}`;

  if (url.length > POLLINATIONS_MAX_URL_LENGTH) {
    throw new PollinationsImageError(
      "prompt_too_long",
      `Prompt is too long for a single Pollinations request (${url.length} chars). ` +
        "The prompt was NOT truncated - please shorten it manually."
    );
  }

  // Fidelity proof: the prompt carried in the URL must decode back to the original.
  const promptInUrl = url.slice(base.length + 1, url.indexOf("?"));
  const debug: PollinationsRequestDebug = {
    provider: "pollinations",
    endpoint: input.endpoint,
    prompt,
    promptLength: prompt.length,
    model,
    width,
    height,
    seed,
    enhance: false,
    nologo,
    negativePromptSent,
    requestUrl: url,
    promptMatchesRequestUrl: decodeURIComponent(promptInUrl) === prompt,
    promptDoubleEncoded: url.includes(encodeURIComponent(encodedPrompt)),
    apiKeyConfigured: hasApiKey,
    authMode: hasApiKey ? "header" : "none",
  };

  if (!debug.promptMatchesRequestUrl) {
    throw new PollinationsImageError(
      "invalid_response",
      "Prompt fidelity check failed: the request URL does not carry the original prompt."
    );
  }

  return { url, debug };
}

// ---------------------------------------------------------------------------
// Response validation + generation
// ---------------------------------------------------------------------------

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(new PollinationsImageError("invalid_response", "Could not read the generated image bytes."));
    reader.readAsDataURL(blob);
  });
}

/** A 200 response is not success - the payload must decode as an image. */
async function verifyImageDecodes(blob: Blob): Promise<void> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      const valid = bitmap.width > 0 && bitmap.height > 0;
      bitmap.close();
      if (valid) return;
    } catch {
      // fall through to the <img> check so we report a uniform error
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new PollinationsImageError(
            "invalid_response",
            "Pollinations returned data that is not a decodable image."
          )
        );
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export interface PollinationsGenerationResult {
  /** Data URL of the EXACT bytes returned by Pollinations (stable across re-render/save/download). */
  imageUrl: string;
  blob: Blob;
  debug: PollinationsRequestDebug;
}

/**
 * Sends one Pollinations request for the selected model and returns the image
 * that the provider actually produced. No other provider is ever called here.
 */
export async function generatePollinationsImage(
  input: PollinationsRequestInput
): Promise<PollinationsGenerationResult> {
  const hasApiKey = Boolean(input.apiKey && input.apiKey.trim());

  if (!isPollinationsModelAvailable(input.model, input.endpoint, hasApiKey)) {
    const model = getPollinationsModel(input.model);
    const reason = !model
      ? `Unknown Pollinations model "${input.model}".`
      : `Model "${input.model}" needs a Pollinations API key (active tier: ${input.endpoint}).`;
    throw new PollinationsImageError("model_unavailable", reason);
  }

  const { url, debug } = buildPollinationsImageRequest(input);

  // Requirement: verify/log the FINAL request before sending it (never the key).
  console.info("[pollinations] FINAL REQUEST", { ...debug });
  console.info("POLLINATIONS FINAL PROMPT:", debug.prompt);

  const startedAt = Date.now();
  const request = (requestUrl: string, useHeader: boolean) =>
    fetch(requestUrl, {
      method: "GET",
      headers: useHeader
        ? { Accept: "image/*", Authorization: `Bearer ${input.apiKey || ""}` }
        : { Accept: "image/*" },
    });

  let response: Response;
  try {
    response = await request(url, hasApiKey);
  } catch {
    if (!hasApiKey) {
      debug.durationMs = Date.now() - startedAt;
      console.error("[pollinations] NETWORK FAILURE", { status: "unreachable", model: debug.model });
      throw new PollinationsImageError(
        "network",
        "Could not reach Pollinations. Check the internet connection and try again."
      );
    }
    // A keyed GET can be blocked by CORS preflight; the documented browser
    // fallback is the key query parameter. The key is never logged.
    try {
      response = await request(`${url}&key=${encodeURIComponent(input.apiKey || "")}`, false);
      debug.authMode = "query";
    } catch {
      debug.durationMs = Date.now() - startedAt;
      console.error("[pollinations] NETWORK FAILURE", { status: "unreachable", model: debug.model });
      throw new PollinationsImageError(
        "network",
        "Could not reach Pollinations. Check the internet connection and try again."
      );
    }
  }

  debug.status = response.status;
  debug.contentType = response.headers.get("content-type");
  debug.durationMs = Date.now() - startedAt;

  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 200);
    } catch {
      detail = "";
    }
    if (response.status === 401 || response.status === 403) {
      throw new PollinationsImageError(
        "unauthorized",
        `Pollinations rejected the request (${response.status}). ` +
          (hasApiKey
            ? "The configured Pollinations API key is invalid or has no image access."
            : "Pollinations now requires an API key for image generation - the key-less free tier is closed."),
        response.status
      );
    }
    if (response.status === 429) {
      throw new PollinationsImageError(
        "rate_limited",
        "Pollinations rate limit reached (429). Wait a moment or add an API key for a higher quota.",
        429
      );
    }
    if (response.status === 402) {
      throw new PollinationsImageError(
        "provider_error",
        "Pollinations balance is empty. Top up your paid pollen balance at enter.pollinations.ai/top-up, then try again.",
        402
      );
    }
    throw new PollinationsImageError(
      "provider_error",
      `Pollinations failed with status ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status
    );
  }

  const contentType = debug.contentType || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new PollinationsImageError(
      "invalid_response",
      `Pollinations returned "${contentType || "unknown content"}" instead of an image.`,
      response.status
    );
  }

  const blob = await response.blob();
  debug.bytes = blob.size;
  if (!blob.size) {
    throw new PollinationsImageError(
      "invalid_response",
      "Pollinations returned an empty image (0 bytes).",
      response.status
    );
  }

  await verifyImageDecodes(blob);
  const imageUrl = await blobToDataUrl(blob);

  console.info("[pollinations] RESPONSE OK", {
    status: debug.status,
    contentType: debug.contentType,
    bytes: debug.bytes,
    durationMs: debug.durationMs,
    model: debug.model,
    endpoint: debug.endpoint,
    width: debug.width,
    height: debug.height,
  });

  return { imageUrl, blob, debug };
}
