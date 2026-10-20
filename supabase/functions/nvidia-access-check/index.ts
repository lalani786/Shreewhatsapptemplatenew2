import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODELS = [
  {
    id: "flux.1-schnell",
    label: "flux.1-schnell",
    type: "Image",
    url: "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
    body: { prompt: "test prompt", width: 1024, height: 1024, steps: 4, seed: 0 },
  },
  {
    id: "sdxl-turbo",
    label: "sdxl-turbo",
    type: "Image",
    url: "https://ai.api.nvidia.com/v1/genai/stabilityai/sdxl-turbo",
    body: {
      text_prompts: [{ text: "test prompt", weight: 1 }],
      width: 1024,
      height: 1024,
      steps: 4,
      seed: 0,
    },
  },
  {
    id: "stable-diffusion-3-medium",
    label: "stable-diffusion-3-medium",
    type: "Image",
    url: "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium",
    body: { prompt: "test prompt", cfg_scale: 5, aspect_ratio: "1:1", seed: 0, steps: 28, negative_prompt: "" },
  },
  {
    id: "cosmos-predict1-7b-image2world",
    label: "cosmos-predict1-7b-image2world",
    type: "Video",
    url: "https://ai.api.nvidia.com/v1/genai/nvidia/cosmos-predict1-7b-image2world",
    body: { prompt: "test prompt" },
  },
];

async function probe(url: string, body: unknown, apiKey: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = (await res.text()).slice(0, 300);
    return { status: res.status, text };
  } catch (e) {
    return {
      status: 0,
      text: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user }, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: creds } = await supabase
      .from("api_credentials")
      .select("nvidia_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    const apiKey = (creds as any)?.nvidia_api_key || Deno.env.get("NVIDIA_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "NVIDIA API key not configured. Add it in API Setup.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const now = new Date().toISOString();
    const results = await Promise.all(
      MODELS.map(async (m) => {
        if (m.type === "Video") {
          return {
            id: m.id,
            label: m.label,
            type: m.type,
            endpoint: m.url,
            httpStatus: 404,
            status: "Endpoint Unavailable",
            access: "denied",
            reason: "Deprecated endpoint: NVIDIA Cosmos preview endpoint is retired.",
            lastChecked: now,
          };
        }

        const r = await probe(m.url, m.body, apiKey);
        let status = "Endpoint Unavailable";
        let access: "granted" | "denied" | "invalid_key" | "unknown" = "unknown";
        let reason = "";

        if (r.status === 200) {
          status = "Available";
          access = "granted";
          reason = "Model is available and ready for inference.";
        } else if (r.status === 401) {
          status = "Access Denied";
          access = "invalid_key";
          reason = "Invalid NVIDIA API key or authorization token.";
        } else if (r.status === 403) {
          status = "Access Denied";
          access = "denied";
          reason = r.text.includes("Authorization failed")
            ? "Authorization failed for this model."
            : "Model not enabled on your NVIDIA account. Accept license terms at build.nvidia.com.";
        } else if (r.status === 404) {
          status = "Access Denied";
          access = "denied";
          reason = r.text.includes("Not found for account")
            ? "Model not enabled on your NVIDIA account."
            : "Model endpoint returned 404 Not Found.";
        } else if (r.status === 402) {
          status = "Access Denied";
          access = "denied";
          reason = "NVIDIA credits exhausted (HTTP 402).";
        } else if (r.status === 422) {
          status = "Available";
          access = "granted";
          reason = "Model is accessible on this account.";
        } else if (r.status === 429) {
          status = "Rate Limited";
          access = "denied";
          reason = "NVIDIA rate limit reached (HTTP 429).";
        } else if (r.status === 0) {
          status = "Endpoint Unavailable";
          access = "unknown";
          reason = r.text.includes("aborted")
            ? "Timed out while checking this model."
            : `Network check failed: ${r.text.slice(0, 100)}`;
        } else {
          status = "Endpoint Unavailable";
          access = "unknown";
          reason = `HTTP ${r.status}: ${r.text.slice(0, 120)}`;
        }

        return {
          id: m.id,
          label: m.label,
          type: m.type,
          endpoint: m.url,
          httpStatus: r.status,
          status,
          access,
          reason,
          lastChecked: now,
        };
      }),
    );

    const allGranted = results.some((r) => r.access === "granted");
    return new Response(
      JSON.stringify({ ok: allGranted, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "error" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
