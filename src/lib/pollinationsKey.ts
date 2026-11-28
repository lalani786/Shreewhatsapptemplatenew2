import { supabase } from "@/integrations/supabase/client";

/**
 * Pollinations API key inspection (used by API Setup -> "Test Key").
 *
 * Why this module exists (verified live, 2026-09-24):
 *   GET https://gen.pollinations.ai/account/keys   (PLURAL) - "List API Keys"
 *   requires the `account:keys` account permission. A perfectly valid,
 *   image-capable key that was minted without that permission is answered with
 *   HTTP 401/403 ("Permission denied"), which the UI used to report as
 *   "Pollinations rejected this key (invalid or no image access)".
 *
 *   GET https://gen.pollinations.ai/account/key    (SINGULAR) - "Get API Key Info"
 *   is the endpoint Pollinations documents for this exact job: "Returns
 *   information about the API key used in the request: validity, type
 *   (secret/publishable), expiry, permissions, and remaining budget. Useful for
 *   validating keys without making generation requests." It needs nothing but
 *   the key itself.
 *
 * Guarantees:
 *   1. The key is sent in the Authorization header (documented browser fallback:
 *      the `?key=` query parameter). It is never logged and never echoed back in
 *      a result object.
 *   2. A 200 response is not trusted blindly - `valid` must be `true`.
 *   3. `permissions.models === null` means "every model is allowed", so the key
 *      can generate images. A non-null array is intersected with the live image
 *      model catalog; an unreadable catalog reports "unknown" rather than a
 *      false rejection.
 *   4. Transport problems are reported as "unreachable" and never as "invalid",
 *      so a network hiccup can never mark a working key as bad.
 */

/** Pollinations API origin (all documented endpoints live under it). */
export const POLLINATIONS_API_ORIGIN = "https://gen.pollinations.ai";
/** Key-validation endpoint - "Get API Key Info" (singular, no scope required). */
export const POLLINATIONS_ACCOUNT_KEY_URL = `${POLLINATIONS_API_ORIGIN}/account/key`;
/** Public image model catalog (no key required). */
export const POLLINATIONS_IMAGE_MODELS_URL = `${POLLINATIONS_API_ORIGIN}/image/models`;

export type PollinationsApiKeyType = "secret" | "publishable";

export interface PollinationsApiKeyPermissions {
  /** Allowed model ids - `null` means every model is allowed. */
  models: string[] | null;
  /** Account permissions - `null` means no account access. */
  account: string[] | null;
}

export interface PollinationsApiKeyInfo {
  valid: boolean;
  type?: PollinationsApiKeyType;
  name?: string | null;
  expiresAt?: string | null;
  expiresIn?: number | null;
  permissions?: PollinationsApiKeyPermissions;
  /** Remaining pollen budget for this key - `null` means unlimited (account balance). */
  pollenBudget?: number | null;
  rateLimitEnabled?: boolean;
}

export type PollinationsApiKeyCheckStatus = "valid" | "invalid" | "unreachable";

export interface PollinationsApiKeyCheck {
  status: PollinationsApiKeyCheckStatus;
  /** HTTP status of the validation response, when one was received. */
  httpStatus?: number;
  /** Present when the endpoint answered with a parsable key record. */
  info?: PollinationsApiKeyInfo;
  /**
   * Human-readable reason. Never contains the key itself - on 401/403 it
   * carries the server's safe error excerpt (message/code) so a real
   * rejection can be told apart from a paste problem.
   */
  detail?: string;
}

/** How much of the image model catalog the key is allowed to run. */
export type PollinationsImageAccess = "all" | "partial" | "none" | "unknown";

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((entry): entry is string => typeof entry === "string");
}

/** Parses a `/account/key` payload defensively - a shape change must not throw. */
export function parsePollinationsApiKeyInfo(payload: unknown): PollinationsApiKeyInfo | null {
  if (!payload || typeof payload !== "object") return null;

  const raw = payload as Record<string, unknown>;
  if (typeof raw.valid !== "boolean") return null;

  const permissionsRaw =
    raw.permissions && typeof raw.permissions === "object"
      ? (raw.permissions as Record<string, unknown>)
      : null;

  return {
    valid: raw.valid,
    type: raw.type === "secret" || raw.type === "publishable" ? raw.type : undefined,
    name: typeof raw.name === "string" ? raw.name : null,
    expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : null,
    expiresIn: typeof raw.expiresIn === "number" ? raw.expiresIn : null,
    permissions: permissionsRaw
      ? {
          models: asStringArray(permissionsRaw.models),
          account: asStringArray(permissionsRaw.account),
        }
      : undefined,
    pollenBudget: typeof raw.pollenBudget === "number" ? raw.pollenBudget : null,
    rateLimitEnabled: raw.rateLimitEnabled === true,
  };
}

async function requestKeyInfo(key: string, url: string, useHeader: boolean): Promise<Response> {
  return fetch(url, {
    method: "GET",
    headers: useHeader
      ? { Accept: "application/json", Authorization: `Bearer ${key}` }
      : { Accept: "application/json" },
  });
}

/**
 * Safely extracts a short server error excerpt (message/code/error) without
 * ever echoing the key. Caps length so UI stays readable.
 */
function extractServerErrorExcerpt(bodyText: string, key: string): string | undefined {
  let text = (bodyText || "").trim();
  if (!text) return undefined;
  // Defensive: never display the key even if a proxy echoed the request.
  if (key) text = text.split(key).join("<redacted>");
  // Prefer a JSON message field when the body is JSON.
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const candidate =
      (typeof parsed.message === "string" && parsed.message) ||
      (typeof parsed.error === "string" && parsed.error) ||
      "";
    if (candidate) {
      const code = typeof parsed.code === "string" ? ` (${parsed.code})` : "";
      return `${candidate}${code}`.slice(0, 220);
    }
  } catch {
    /* not JSON - fall through to raw text */
  }
  return text.slice(0, 220) || undefined;
}

/**
 * Validates a Pollinations API key against the documented validation endpoint.
 * Never throws: every failure mode maps to an `unreachable`/`invalid` result.
 */
export async function fetchPollinationsApiKeyInfo(apiKey: string): Promise<PollinationsApiKeyCheck> {
  const key = apiKey ?? "";
  if (!key.length) return { status: "invalid", detail: "No API key was provided." };

  let response: Response;
  try {
    response = await requestKeyInfo(key, POLLINATIONS_ACCOUNT_KEY_URL, true);
  } catch {
    // A keyed browser GET can be blocked by a CORS preflight; the documented
    // browser transport fallback is the `?key=` query parameter.
    try {
      response = await requestKeyInfo(
        key,
        `${POLLINATIONS_ACCOUNT_KEY_URL}?key=${encodeURIComponent(key)}`,
        false
      );
    } catch {
      return {
        status: "unreachable",
        detail: "Could not reach gen.pollinations.ai to validate the key.",
      };
    }
  }

  const httpStatus = response.status;

  // This endpoint answers 401/403 for an invalid, expired or revoked key.
  // Read a short server excerpt (never the key) so the UI can show WHY it
  // was rejected instead of guessing "paste problem".
  if (httpStatus === 401 || httpStatus === 403) {
    let serverReason: string | undefined;
    try {
      serverReason = extractServerErrorExcerpt(await response.text(), key);
    } catch {
      serverReason = undefined;
    }
    return { status: "invalid", httpStatus, detail: serverReason };
  }

  if (!response.ok) {
    return {
      status: "unreachable",
      httpStatus,
      detail: `Unexpected HTTP ${httpStatus} from the Pollinations key endpoint.`,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      status: "unreachable",
      httpStatus,
      detail: "Pollinations returned a non-JSON response for the key check.",
    };
  }

  const info = parsePollinationsApiKeyInfo(payload);
  if (!info || info.valid !== true) return { status: "invalid", httpStatus, info: info ?? undefined };

  return { status: "valid", httpStatus, info };
}

/** Model ids may arrive as a bare array or wrapped in `value`/`data`/`models`. */
function extractModelList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const raw = payload as Record<string, unknown>;
    for (const field of ["value", "data", "models"] as const) {
      if (Array.isArray(raw[field])) return raw[field] as unknown[];
    }
  }
  return [];
}

let cachedImageModelIds: string[] | null = null;

/**
 * Live list of image model ids. Returns `null` when the catalog cannot be read -
 * callers must treat that as "unknown", never as "no access".
 */
export async function fetchPollinationsImageModelIds(): Promise<string[] | null> {
  if (cachedImageModelIds) return cachedImageModelIds;

  try {
    const response = await fetch(POLLINATIONS_IMAGE_MODELS_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const ids = extractModelList(await response.json())
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          const name = (entry as Record<string, unknown>).name;
          if (typeof name === "string") return name;
        }
        return null;
      })
      .filter((id): id is string => Boolean(id));

    if (!ids.length) return null;
    cachedImageModelIds = ids;
    return ids;
  } catch {
    return null;
  }
}

/** Test hook: clears the image catalog cache. */
export function resetPollinationsImageModelCache(): void {
  cachedImageModelIds = null;
}

/**
 * Resolves whether the key can actually run image models.
 *   - `all`     every allowed model is an image model (or `models === null` = unrestricted)
 *   - `partial` some image models are allowed
 *   - `none`    the key is valid but its allowlist excludes every image model
 *   - `unknown` no permission info, or the catalog could not be read
 */
export function resolvePollinationsImageAccess(
  info: PollinationsApiKeyInfo | undefined,
  imageModelIds: string[] | null
): PollinationsImageAccess {
  if (!info?.permissions) return "unknown";

  const models = info.permissions.models;
  // null = every model on the platform is allowed for this key.
  if (models === null) return "all";
  if (!models.length) return "none";
  if (!imageModelIds || !imageModelIds.length) return "unknown";

  const allowed = new Set(models);
  const matched = imageModelIds.filter((id) => allowed.has(id)).length;
  if (!matched) return "none";
  return matched === imageModelIds.length ? "all" : "partial";
}

// ---------------------------------------------------------------------------
// Unified Pollinations API Key Storage & Sync (Supabase ai_api_keys + localStorage)
// ---------------------------------------------------------------------------

let memoryPollinationsApiKey: string | null = null;

/**
 * Returns the currently stored Pollinations API key (synchronous).
 * Checks memory cache first, then localStorage.
 */
export function getStoredPollinationsApiKey(): string {
  if (memoryPollinationsApiKey) return memoryPollinationsApiKey;
  try {
    const local = localStorage.getItem("pollinations_api_key")?.trim() || "";
    if (local) {
      memoryPollinationsApiKey = local;
      return local;
    }
  } catch {
    // localStorage not accessible
  }
  return "";
}

/**
 * Loads the active Pollinations API key from Supabase.
 * Checks `ai_api_keys` (dedicated table) first, then `api_credentials`.
 * Updates localStorage and in-memory cache with the fresh value.
 */
export async function loadPollinationsApiKeyFromSupabase(): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    let key = "";

    if (user) {
      // 1. Check ai_api_keys table (dedicated table in Supabase)
      try {
        const { data: aiData, error: aiError } = await (supabase as any)
          .from("ai_api_keys")
          .select("pollinations_api_key")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!aiError && aiData?.pollinations_api_key) {
          key = aiData.pollinations_api_key.trim();
        }
      } catch (err) {
        console.warn("[pollinationsKey] Could not read from ai_api_keys:", err);
      }

      // 2. Check api_credentials table as fallback
      if (!key) {
        try {
          const { data: credData, error: credError } = await supabase
            .from("api_credentials")
            .select("pollinations_api_key" as any)
            .eq("user_id", user.id)
            .maybeSingle();

          if (!credError && (credData as any)?.pollinations_api_key) {
            key = ((credData as any).pollinations_api_key as string).trim();
          }
        } catch {
          // column may not exist in api_credentials
        }
      }

      // 3. If found in Supabase, update localStorage & memory cache
      if (key) {
        memoryPollinationsApiKey = key;
        try {
          localStorage.setItem("pollinations_api_key", key);
        } catch {
          // ignore
        }
        return key;
      }

      // 4. If not found in Supabase, check localStorage
      const local = getStoredPollinationsApiKey();
      if (local && user) {
        // Sync local key back to Supabase so it persists across devices/sessions
        try {
          await (supabase as any)
            .from("ai_api_keys")
            .upsert({
              user_id: user.id,
              pollinations_api_key: local,
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" });
        } catch {
          // ignore background sync errors
        }
        return local;
      }
    }
  } catch (err) {
    console.warn("[pollinationsKey] Failed to load key from Supabase:", err);
  }

  return getStoredPollinationsApiKey();
}

/**
 * Saves the Pollinations API key to Supabase (ai_api_keys table) and local storage.
 * Ensures the existing record is updated without creating duplicates (onConflict: user_id).
 * Verifies Supabase update success before returning.
 */
export async function savePollinationsApiKey(rawApiKey: string): Promise<{ success: boolean; error?: string }> {
  const key = rawApiKey?.trim() || "";

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      // Still store in localStorage for offline/unauthenticated mode
      if (key) {
        localStorage.setItem("pollinations_api_key", key);
        memoryPollinationsApiKey = key;
      } else {
        localStorage.removeItem("pollinations_api_key");
        memoryPollinationsApiKey = "";
      }
      window.dispatchEvent(new CustomEvent("pollinations-key-updated", { detail: { apiKey: key } }));
      return { success: false, error: "Please sign in to save your API key to your account." };
    }

    // 1. Primary Save: ai_api_keys table (dedicated table with user_id UNIQUE constraint)
    const { error: aiKeyError } = await (supabase as any)
      .from("ai_api_keys")
      .upsert({
        user_id: user.id,
        pollinations_api_key: key || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (aiKeyError) {
      console.error("[pollinationsKey] Failed to save to ai_api_keys:", aiKeyError);
      return { success: false, error: aiKeyError.message || "Failed to update Supabase configuration." };
    }

    // 2. Secondary Save: api_credentials table (if column exists)
    try {
      await supabase
        .from("api_credentials")
        .upsert({
          user_id: user.id,
          pollinations_api_key: key || null,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "user_id" });
    } catch {
      // Safe to ignore if column is missing on api_credentials
    }

    // 3. Update localStorage and memory cache
    memoryPollinationsApiKey = key;
    if (key) {
      localStorage.setItem("pollinations_api_key", key);
    } else {
      localStorage.removeItem("pollinations_api_key");
    }

    // 4. Broadcast update to all listeners (SocialMedia, PhotoStudio, AiTemplate)
    window.dispatchEvent(new CustomEvent("pollinations-key-updated", { detail: { apiKey: key } }));

    return { success: true };
  } catch (err: any) {
    console.error("[pollinationsKey] Unexpected save error:", err);
    return { success: false, error: err?.message || "An unexpected error occurred while saving." };
  }
}
