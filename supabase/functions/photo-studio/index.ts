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

const LOVABLE_MODELS = [
  "google/gemini-2.5-flash-image",
  "google/gemini-3.1-flash-image-preview",
  "google/gemini-3-pro-image-preview",
];

async function generateWithPexels(apiKey: string, prompt: string) {
  try {
    const cleanQuery = prompt.replace(/[^\w\s]/gi, " ").trim().split(/\s+/).slice(0, 5).join(" ");
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(cleanQuery || "product")}&per_page=10`;
    const res = await fetch(url, { headers: { Authorization: apiKey } });
    if (!res.ok) return { error: `Pexels error (${res.status})` };
    const data = await res.json();
    const photos = data.photos || [];
    if (!photos.length) return { error: `No Pexels photos found for "${cleanQuery}".` };
    const p = photos[Math.floor(Math.random() * Math.min(photos.length, 5))];
    return {
      imageUrl: p.src?.large2x || p.src?.large || p.src?.original,
      warning: `Photo from Pexels by ${p.photographer}`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Pexels search failed" };
  }
}

async function generateWithLovable(model: string, prompt: string, referenceImage?: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.warn("LOVABLE_API_KEY not configured. Falling back to Flux (Pollinations AI).");
    try {
      const imageUrl = await generateWithPollinations(prompt);
      return { imageUrl, warning: "Lovable API key not configured. Generated photo using Flux AI." };
    } catch (err: any) {
      return { error: err?.message || "Generation failed" };
    }
  }

  const content: any[] = [{ type: "text", text: prompt }];
  if (referenceImage) content.push({ type: "image_url", image_url: { url: referenceImage } });

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LOVABLE_MODELS.includes(model) ? model : "google/gemini-3.1-flash-image-preview",
      messages: [{ role: "user", content }],
      modalities: ["image", "text"],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Lovable AI error:", response.status, errText);
    if (response.status === 429) return { error: "Rate limit exceeded. Please try again later." };
    if (response.status === 402) return { error: "Lovable AI credits exhausted. Add funds in Settings > Workspace > Usage." };
    // Try fallback on failure
    console.warn("Lovable AI call failed. Falling back to Flux (Pollinations AI).");
    try {
      const imageUrl = await generateWithPollinations(prompt);
      return { imageUrl, warning: "Generated photo using Flux AI fallback." };
    } catch (err: any) {
      return { error: err?.message || "Generation failed" };
    }
  }
  const data = await response.json();
  const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imageUrl) {
    try {
      const fallbackUrl = await generateWithPollinations(prompt);
      return { imageUrl: fallbackUrl, warning: "Generated photo using Flux AI fallback." };
    } catch (err: any) {
      return { error: err?.message || "Generation failed" };
    }
  }
  return { imageUrl };
}

async function generateWithStability(apiKey: string, prompt: string) {
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("output_format", "png");

  const response = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "image/*" },
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Stability error:", response.status, errText);
    if (response.status === 401) return { error: "Invalid Stability API key. Update it in API Setup." };
    if (response.status === 402) return { error: "Stability credits exhausted." };
    return { error: `Stability failed (${response.status})` };
  }
  const buf = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  const b64 = btoa(binary);
  return { imageUrl: `data:image/png;base64,${b64}` };
}

async function generateWithNvidia(apiKey: string, prompt: string) {
  // Try multiple NVIDIA NIM image endpoints (function IDs change over time)
  const endpoints = [
    {
      name: "flux.1-schnell",
      url: "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
      body: { prompt, width: 1024, height: 1024, steps: 4, seed: 0 },
      extract: (d: any) => d?.artifacts?.[0]?.base64 || d?.image,
    },
    {
      name: "sdxl-turbo",
      url: "https://ai.api.nvidia.com/v1/genai/stabilityai/sdxl-turbo",
      body: { text_prompts: [{ text: prompt, weight: 1 }], width: 1024, height: 1024, steps: 4, seed: 0 },
      extract: (d: any) => d?.artifacts?.[0]?.base64 || d?.image,
    },
    {
      name: "stable-diffusion-3-medium",
      url: "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium",
      body: { prompt, cfg_scale: 5, aspect_ratio: "1:1", seed: 0, steps: 50, negative_prompt: "" },
      extract: (d: any) => d?.image || d?.artifacts?.[0]?.base64,
    },
  ];

  let lastErr = "";
  for (const ep of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(ep.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(ep.body),
        signal: controller.signal,
      });

      if (response.status === 401) return { error: "Invalid NVIDIA API key. Update it in API Setup." };
      if (!response.ok) {
        const bodyText = (await response.text()).slice(0, 300);
        if (response.status === 404 && bodyText.includes("Not found for account")) {
          lastErr = `${ep.name}: model not enabled on this NVIDIA account`;
        } else if (response.status === 403) {
          lastErr = `${ep.name}: access forbidden`;
        } else if (response.status === 402) {
          lastErr = `${ep.name}: NVIDIA credits exhausted`;
        } else {
          lastErr = `${ep.name}: HTTP ${response.status}`;
        }
        console.error("NVIDIA endpoint failed:", lastErr, bodyText);
        continue;
      }
      const data = await response.json();
      const base64 = ep.extract(data);
      if (!base64) {
        lastErr = `no image from ${ep.url.split("/").pop()}`;
        continue;
      }
      return { imageUrl: `data:image/png;base64,${base64}` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastErr = msg.includes("aborted") ? `${ep.name}: timed out` : `${ep.name}: ${msg}`;
      console.error("NVIDIA fetch error:", lastErr);
    } finally {
      clearTimeout(timer);
    }
  }
  console.warn("NVIDIA unavailable, falling back to Pollinations:", lastErr);
  try {
    const imageUrl = await generateWithPollinations(prompt);
    return {
      imageUrl,
      provider: "pollinations",
      warning: "NVIDIA image models are not enabled or timed out, so Pollinations AI was used as fallback.",
    };
  } catch (_fallbackError) {
    return { error: `NVIDIA failed and fallback generation was unavailable (${lastErr}).` };
  }
}

async function generateWithPollinations(prompt: string, apiKey?: string) {
  const safePrompt = prompt.length > 1900 ? prompt.slice(0, 1900) : prompt;
  const seed = String(Math.floor(Math.random() * 1_000_000));

  if (apiKey && apiKey.trim()) {
    try {
      const res = await fetch(`https://gen.pollinations.ai/image/${encodeURIComponent(safePrompt)}?width=1024&height=1024&seed=${seed}&nologo=true`, {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      });
      if (res.ok) {
        const contentType = res.headers.get("content-type") || "image/jpeg";
        const buf = new Uint8Array(await res.arrayBuffer());
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < buf.length; i += chunk) {
          binary += String.fromCharCode(...buf.subarray(i, i + chunk));
        }
        return `data:${contentType};base64,${btoa(binary)}`;
      }
    } catch (e) {
      console.warn("Unified Pollinations with API key failed, trying legacy:", e);
    }
  }

  const params = new URLSearchParams({
    width: "1024",
    height: "1024",
    nologo: "true",
    enhance: "true",
    nofeed: "true",
    safe: "false",
    referrer: "lovable-shree-whatsapp",
    seed,
  });
  const response = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(safePrompt)}?${params.toString()}`, {
    headers: { Referer: "https://lovable.dev" },
  });
  if (!response.ok) throw new Error(`Pollinations fallback failed (${response.status})`);
  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) throw new Error(`Pollinations returned ${contentType}`);
  const buf = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

async function generateWithLeonardo(apiKey: string, prompt: string) {
  const createRes = await fetch("https://cloud.leonardo.ai/api/rest/v1/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      prompt,
      modelId: "aa77f04e-3eec-4034-9c07-d0f619684628", // Leonardo Kino XL (photoreal)
      width: 1024,
      height: 1024,
      num_images: 1,
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    console.error("Leonardo create error:", createRes.status, errText);
    if (createRes.status === 401) return { error: "Invalid Leonardo API key. Update it in API Setup." };
    return { error: `Leonardo failed (${createRes.status})` };
  }
  const created = await createRes.json();
  const generationId = created?.sdGenerationJob?.generationId;
  if (!generationId) return { error: "Leonardo did not return a generation id." };

  // Poll for completion (up to ~50s)
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(`https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!pollRes.ok) continue;
    const pollData = await pollRes.json();
    const gen = pollData?.generations_by_pk;
    if (gen?.status === "COMPLETE") {
      const url = gen?.generated_images?.[0]?.url;
      if (url) return { imageUrl: url };
      return { error: "Leonardo completed but returned no image." };
    }
    if (gen?.status === "FAILED") return { error: "Leonardo generation failed." };
  }
  return { error: "Leonardo generation timed out. Try again." };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, referenceImage, model } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return json({ error: "Prompt is required" }, 200);
    }

    // Query credentials if authenticated
    const authHeader = req.headers.get("Authorization");
    let creds: any = null;

    if (authHeader) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from("api_credentials")
            .select("stability_api_key, leonardo_api_key, nvidia_api_key, pexels_api_key, pollinations_api_key")
            .eq("user_id", user.id)
            .maybeSingle();
          creds = data;
        }
      } catch (_) {}
    }

    if (model === "pollinations") {
      const apiKey = creds?.pollinations_api_key || Deno.env.get("POLLINATIONS_API_KEY");
      try {
        const img = await generateWithPollinations(prompt, apiKey);
        return json({ imageUrl: img }, 200);
      } catch (err: any) {
        return json({ error: err?.message || "Pollinations generation failed" }, 200);
      }
    }

    // Route based on model
    if (model === "stability" || model === "leonardo" || model === "nvidia" || model === "pexels") {

      if (model === "pexels") {
        const key = creds?.pexels_api_key || Deno.env.get("PEXELS_API_KEY");
        if (!key) {
          return json({ error: "Pexels API key not configured. Add it in API Setup." }, 200);
        }
        return json(await generateWithPexels(key, prompt), 200);
      } else if (model === "stability") {
        const key = creds?.stability_api_key || Deno.env.get("STABILITY_API_KEY");
        if (!key) {
          return json({ error: "Stability API key not configured. Add it in API Setup." }, 200);
        }
        return json(await generateWithStability(key, prompt), 200);
      } else if (model === "nvidia") {
        const key = creds?.nvidia_api_key || Deno.env.get("NVIDIA_API_KEY");
        if (!key) {
          return json({ error: "NVIDIA API key not configured. Add it in API Setup." }, 200);
        }
        return json(await generateWithNvidia(key, prompt), 200);
      } else {
        const key = creds?.leonardo_api_key || Deno.env.get("LEONARDO_API_KEY");
        if (!key) {
          return json({ error: "Leonardo API key not configured. Add it in API Setup." }, 200);
        }
        return json(await generateWithLeonardo(key, prompt), 200);
      }
    }

    // Default: Lovable AI (with automatic Flux fallback if LOVABLE_API_KEY is not configured)
    return json(await generateWithLovable(model, prompt, referenceImage), 200);
  } catch (e) {
    console.error("photo-studio error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 200);
  }
});
