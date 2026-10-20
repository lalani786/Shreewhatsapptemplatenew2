import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function generateWithLovableAI(
  imagePrompt: string,
  apiKey: string,
): Promise<string> {
  const response = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: imagePrompt }],
        modalities: ["image", "text"],
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Lovable AI image error:", response.status, errorText);
    throw new Error(`Lovable AI image generation failed: ${response.status}`);
  }

  const data = await response.json();
  const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imageUrl) throw new Error("No image generated from Lovable AI");
  return imageUrl;
}

async function generateWithStability(
  imagePrompt: string,
  apiKey: string,
): Promise<string> {
  // Stability hard limit: 2000 chars
  const safePrompt = imagePrompt.length > 1900 ? imagePrompt.slice(0, 1900) : imagePrompt;
  const response = await fetch(
    "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        text_prompts: [{ text: safePrompt, weight: 1 }],
        cfg_scale: 7,
        height: 1024,
        width: 1024,
        steps: 30,
        samples: 1,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Stability AI error:", response.status, errorText);
    if (response.status === 401) throw new Error("Invalid Stability API key. Update it in API Setup.");
    if (response.status === 402 || response.status === 429) {
      throw new Error("Stability credits exhausted. Top up your Stability account or switch provider.");
    }
    throw new Error(`Stability failed (${response.status}): ${errorText.slice(0, 180)}`);
  }

  const data = await response.json();
  const base64 = data.artifacts?.[0]?.base64;
  if (!base64) throw new Error("No image from Stability AI");
  return `data:image/png;base64,${base64}`;
}

async function generateWithPollinations(imagePrompt: string): Promise<string> {
  // Pollinations AI — free, no API key required.
  // Without an auth token, "flux" silently falls back to "sana". We enable
  // enhance=true (LLM prompt expansion) and pass a referrer so results better
  // reflect the user's text input.
  const safePrompt = imagePrompt.length > 1900 ? imagePrompt.slice(0, 1900) : imagePrompt;
  const seed = Math.floor(Math.random() * 1_000_000);
  const params = new URLSearchParams({
    width: "1024",
    height: "1024",
    nologo: "true",
    enhance: "true",
    nofeed: "true",
    safe: "false",
    referrer: "lovable-shree-whatsapp",
    seed: String(seed),
    model: "flux",
  });
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(safePrompt)}?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "Referer": "https://lovable.dev" },
    });
    if (!response.ok) {
      const errText = (await response.text()).slice(0, 200);
      console.error("Pollinations error:", response.status, errText);
      if (response.status === 429) throw new Error("Pollinations rate limit reached. Please wait a moment and try again.");
      if (response.status >= 500) throw new Error(`Pollinations service error (${response.status}). Try again in a few seconds.`);
      throw new Error(`Pollinations failed (${response.status}): ${errText}`);
    }
    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      const errText = (await response.text()).slice(0, 200);
      throw new Error(`Pollinations returned non-image content (${contentType}): ${errText}`);
    }
    const buf = new Uint8Array(await response.arrayBuffer());
    if (buf.length < 512) throw new Error("Empty or invalid image from Pollinations");
    // Base64 encode in chunks to avoid stack overflow on large buffers
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)));
    }
    const base64 = btoa(bin);
    console.log(`Pollinations image OK (${contentType}, ${buf.length} bytes, model=${response.headers.get("x-model-used") || "?"})`);
    return `data:${contentType};base64,${base64}`;
  } finally {
    clearTimeout(timer);
  }
}

const NVIDIA_STANDARD_ENDPOINTS = [
  {
    name: "flux.1-schnell",
    url: "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
    body: { prompt: "", width: 1024, height: 1024, steps: 4, seed: 0 } as any,
    buildBody: (p: string) => ({ prompt: p, width: 1024, height: 1024, steps: 4, seed: 0 }),
    extract: (d: any) => d?.artifacts?.[0]?.base64 || d?.image,
  },
  {
    name: "sdxl-turbo",
    url: "https://ai.api.nvidia.com/v1/genai/stabilityai/sdxl-turbo",
    buildBody: (p: string) => ({ text_prompts: [{ text: p, weight: 1 }], width: 1024, height: 1024, steps: 4, seed: 0 }),
    extract: (d: any) => d?.artifacts?.[0]?.base64 || d?.image,
  },
  {
    name: "stable-diffusion-3-medium",
    url: "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium",
    buildBody: (p: string) => ({ prompt: p, cfg_scale: 5, aspect_ratio: "1:1", seed: 0, steps: 50, negative_prompt: "" }),
    extract: (d: any) => d?.image || d?.artifacts?.[0]?.base64,
  },
];

const NVIDIA_COSMOS_ENDPOINTS = [
  {
    name: "cosmos-predict1-7b-text2image",
    url: "https://ai.api.nvidia.com/v1/genai/nvidia/cosmos-predict1-7b-text2image",
    buildBody: (p: string) => ({ prompt: p, width: 1024, height: 1024, seed: 0 }),
    extract: (d: any) => d?.image || d?.artifacts?.[0]?.base64,
  },
  {
    name: "cosmos-1.0-diffusion-7b-text2image",
    url: "https://ai.api.nvidia.com/v1/genai/nvidia/cosmos-1.0-diffusion-7b-text2image",
    buildBody: (p: string) => ({ prompt: p, width: 1024, height: 1024, seed: 0 }),
    extract: (d: any) => d?.image || d?.artifacts?.[0]?.base64,
  },
];

async function generateWithNvidiaEndpoints(
  imagePrompt: string,
  apiKey: string,
  endpoints: typeof NVIDIA_STANDARD_ENDPOINTS,
  label: string,
): Promise<string> {
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
        body: JSON.stringify(ep.buildBody(imagePrompt)),
        signal: controller.signal,
      });
      if (response.status === 401) throw new Error("Invalid NVIDIA API key. Update it in API Setup.");
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
        console.error(`${label} endpoint failed:`, lastErr, bodyText);
        continue;
      }
      const data = await response.json();
      const base64 = ep.extract(data);
      if (!base64) { lastErr = `no image from ${ep.name}`; continue; }
      return `data:image/png;base64,${base64}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Invalid NVIDIA")) throw e;
      lastErr = msg.includes("aborted") ? `${ep.name}: timed out` : `${ep.name}: ${msg}`;
      console.error(`${label} fetch error:`, lastErr);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`No accessible ${label} image model was available (${lastErr}).`);
}

async function generateWithNvidia(imagePrompt: string, apiKey: string): Promise<string> {
  return generateWithNvidiaEndpoints(imagePrompt, apiKey, NVIDIA_STANDARD_ENDPOINTS, "NVIDIA");
}

async function generateWithCosmos(imagePrompt: string, apiKey: string): Promise<string> {
  return generateWithNvidiaEndpoints(imagePrompt, apiKey, NVIDIA_COSMOS_ENDPOINTS, "NVIDIA Cosmos");
}


async function generateWithLeonardo(
  imagePrompt: string,
  apiKey: string,
): Promise<string> {
  // Leonardo hard limit: 1500 chars
  const safePrompt = imagePrompt.length > 1450 ? imagePrompt.slice(0, 1450) : imagePrompt;
  const createResponse = await fetch(
    "https://cloud.leonardo.ai/api/rest/v1/generations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        prompt: safePrompt,
        modelId: "6b645e3a-d64f-4341-a6d8-7a3690fbf042",
        width: 1024,
        height: 1024,
        num_images: 1,
      }),
    },
  );

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    console.error("Leonardo AI error:", createResponse.status, errorText);
    if (createResponse.status === 401) throw new Error("Invalid Leonardo API key. Update it in API Setup.");
    if (createResponse.status === 402 || createResponse.status === 429) {
      throw new Error("Leonardo credits exhausted. Top up your Leonardo account or switch provider.");
    }
    throw new Error(`Leonardo failed (${createResponse.status}): ${errorText.slice(0, 180)}`);
  }

  const createData = await createResponse.json();
  const generationId = createData.sdGenerationJob?.generationId;
  if (!generationId) throw new Error("No generation ID from Leonardo");

  // Poll for result (max 60s)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollResponse = await fetch(
      `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      },
    );
    if (!pollResponse.ok) continue;
    const pollData = await pollResponse.json();
    const images = pollData.generations_by_pk?.generated_images;
    if (images?.length > 0) return images[0].url;
  }
  throw new Error("Leonardo AI generation timed out");
}

async function getUserApiKey(req: Request, keyColumn: string): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get user from JWT
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error("Unauthorized");

  const { data } = await supabase
    .from("api_credentials")
    .select(keyColumn)
    .eq("user_id", user.id)
    .single();

  const key = data?.[keyColumn as keyof typeof data] as string;
  if (!key) {
    throw new Error(`${keyColumn} not configured. Please add it in API Setup.`);
  }
  return key;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

    const body = await req.json();
    const {
      type,
      businessType,
      productCategory,
      discount,
      occasion,
      customPrompt,
      context,
      imagePrompt,
      imageProvider,
      textProvider,
    } = body;

    // Handle image generation request
    if (type === "generate_image") {
      console.log(
        "Generating image with provider:",
        imageProvider,
        "prompt:",
        imagePrompt?.substring(0, 100),
      );

      try {
        let imageUrl: string = "";
        let providerUsed = imageProvider || "lovable_ai";
        let warning: string | undefined;

        switch (imageProvider) {
          case "stability": {
            const apiKey = await getUserApiKey(req, "stability_api_key");
            imageUrl = await generateWithStability(imagePrompt, apiKey);
            break;
          }
          case "leonardo": {
            const apiKey = await getUserApiKey(req, "leonardo_api_key");
            imageUrl = await generateWithLeonardo(imagePrompt, apiKey);
            break;
          }
          case "nvidia": {
            const apiKey = await getUserApiKey(req, "nvidia_api_key");
            try {
              imageUrl = await generateWithNvidia(imagePrompt, apiKey);
            } catch (nvidiaError) {
              const nvidiaMessage = nvidiaError instanceof Error ? nvidiaError.message : String(nvidiaError);
              if (nvidiaMessage.includes("Invalid NVIDIA") || nvidiaMessage.includes("not configured") || nvidiaMessage.includes("Unauthorized")) {
                throw nvidiaError;
              }
              console.warn("NVIDIA unavailable, falling back to Pollinations:", nvidiaMessage);
              imageUrl = await generateWithPollinations(imagePrompt);
              providerUsed = "pollinations";
              warning = "NVIDIA image models are not enabled or timed out, so Pollinations AI was used as fallback.";
            }
            break;
          }
          case "cosmos": {
            try {
              let apiKey = "";
              try {
                apiKey = await getUserApiKey(req, "nvidia_api_key");
              } catch {
                apiKey = Deno.env.get("NVIDIA_API_KEY") || "";
              }

              if (apiKey) {
                try {
                  imageUrl = await generateWithCosmos(imagePrompt, apiKey);
                  providerUsed = "cosmos";
                } catch (cosmosError) {
                  console.warn("Cosmos NIM cloud endpoint not available, trying NVIDIA FLUX:", cosmosError);
                  try {
                    imageUrl = await generateWithNvidia(imagePrompt, apiKey);
                    providerUsed = "nvidia";
                    warning = "NVIDIA Cosmos NIM requires self-hosted deployment; generated high-resolution frame using NVIDIA FLUX.1.";
                  } catch (fluxErr) {
                    console.warn("NVIDIA FLUX also failed, falling back to Pollinations:", fluxErr);
                    imageUrl = await generateWithPollinations(imagePrompt);
                    providerUsed = "pollinations";
                    warning = "NVIDIA endpoints unavailable; generated frame using Pollinations AI.";
                  }
                }
              } else {
                console.warn("No NVIDIA API key configured, using Pollinations AI for Cosmos frame");
                imageUrl = await generateWithPollinations(imagePrompt);
                providerUsed = "pollinations";
                warning = "NVIDIA API key not configured; generated frame using Pollinations AI.";
              }
            } catch (err: any) {
              console.warn("Cosmos generation fallback triggered:", err);
              imageUrl = await generateWithPollinations(imagePrompt);
              providerUsed = "pollinations";
              warning = "Generated frame using Pollinations AI fallback.";
            }
            break;
          }
          case "auto": {
            // Try NVIDIA → Cosmos → Pollinations → Lovable AI in order
            let done = false;
            try {
              const apiKey = await getUserApiKey(req, "nvidia_api_key");
              try {
                imageUrl = await generateWithNvidia(imagePrompt, apiKey);
                providerUsed = "nvidia";
                done = true;
              } catch (e) {
                console.warn("Auto: NVIDIA failed, trying Cosmos:", e instanceof Error ? e.message : e);
                try {
                  imageUrl = await generateWithCosmos(imagePrompt, apiKey);
                  providerUsed = "cosmos";
                  done = true;
                } catch (e2) {
                  console.warn("Auto: Cosmos failed:", e2 instanceof Error ? e2.message : e2);
                }
              }
            } catch (keyErr) {
              console.warn("Auto: NVIDIA key not configured, skipping to Pollinations");
            }
            if (!done) {
              try {
                imageUrl = await generateWithPollinations(imagePrompt);
                providerUsed = "pollinations";
                done = true;
              } catch (e) {
                console.warn("Auto: Pollinations failed, using Lovable AI:", e instanceof Error ? e.message : e);
              }
            }
            if (!done) {
              if (LOVABLE_API_KEY) {
                imageUrl = await generateWithLovableAI(imagePrompt, LOVABLE_API_KEY);
                providerUsed = "lovable_ai";
              } else {
                imageUrl = await generateWithPollinations(imagePrompt);
                providerUsed = "pollinations";
              }
            }
            if (providerUsed !== (imageProvider || "auto")) {
              warning = `Automatic fallback used ${providerUsed}.`;
            }
            break;
          }
          case "pollinations": {
            imageUrl = await generateWithPollinations(imagePrompt);
            providerUsed = "pollinations";
            break;
          }
          default: {
            if (LOVABLE_API_KEY) {
              imageUrl = await generateWithLovableAI(
                imagePrompt,
                LOVABLE_API_KEY,
              );
              providerUsed = "lovable_ai";
            } else {
              imageUrl = await generateWithPollinations(imagePrompt);
              providerUsed = "pollinations";
              warning = "Lovable AI not configured; generated using Pollinations AI.";
            }
            break;
          }
        }

        console.log(
          "Image generated successfully via",
          imageProvider || "lovable_ai",
        );

        return new Response(
          JSON.stringify({ imageUrl, provider: providerUsed, warning }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (imgError) {
        const provider = imageProvider || "lovable_ai";
        const message = imgError instanceof Error
          ? imgError.message
          : "Unknown error";
        console.error(`Image generation failed [${provider}]:`, message);

        const userMessage =
          message.includes("401") || message.includes("Unauthorized")
            ? `Authentication failed. Please verify your ${provider} API key in API Setup.`
            : message.includes("402") || message.includes("403") ||
                message.includes("credits") || message.includes("balance") ||
                message.includes("locked")
            ? `Insufficient credits/balance on your ${provider} account. Please top up your balance.`
            : message.includes("429") || message.includes("rate")
            ? `Rate limit exceeded for ${provider}. Please wait and try again.`
            : message.includes("not configured")
            ? message
            : `${provider} image generation failed: ${message}`;

        return new Response(
          JSON.stringify({ error: userMessage, provider }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }


    let systemPrompt = "";
    let userPrompt = "";

    if (type === "marketing_template") {
      systemPrompt =
        `You are an expert Indian marketing copywriter specializing in WhatsApp Business marketing. 
You create engaging, festive, and culturally relevant marketing messages optimized for Indian audiences.
Your messages are concise, use emojis appropriately, and include clear call-to-actions.
Always maintain a professional yet friendly tone.`;

      const hasDiscount = discount && discount > 0;
      userPrompt =
        `Create a WhatsApp marketing message and promotional poster image prompt for:

Business Type: ${businessType}
Product Category: ${productCategory || "General products"}
${
          hasDiscount
            ? `Discount: ${discount}% OFF`
            : "No discount offer - focus on brand awareness and product showcase"
        }
Occasion: ${occasion}
${customPrompt ? `Additional Instructions: ${customPrompt}` : ""}

Please provide:
1. A WhatsApp message template (max 500 characters) with:
   - Festive greeting appropriate for ${occasion}
${
          hasDiscount
            ? "   - Clear discount offer"
            : "   - Focus on product quality and brand value (NO discount or percentage mentioned)"
        }
   - Urgency element
   - Call-to-action
   - Relevant emojis

2. A professional commercial image prompt for an AI image generator (FLUX / Midjourney style):
   - Subject: Vibrant commercial product photography or 3D promotional visual for ${businessType} (${productCategory || "products"})
   - Atmosphere: Festive Indian visual theme matching ${occasion} with elegant decorative elements (e.g. golden accents, warm ambient lighting, festive background)
   - Style: High-end commercial advertisement, studio lighting, hyper-realistic, 8k resolution, clean composition
   - STRICT RULES FOR IMAGE PROMPT:
     * Describe VISUAL objects, materials, and lighting — NOT mobile app screens or paragraphs of chat messages.
     * DO NOT ask the AI to draw entire phone UI chat screens, chat bubbles, or paragraphs of text (this causes distorted alien gibberish).
${
          hasDiscount
            ? `     * Include a bold, elegant badge with "${discount}% OFF".`
            : "     * ABSOLUTELY NO DISCOUNT, NO 0% OFF, and NO price badges."
        }
     * Include ample clean negative space for professional text overlays.
     * Format as a single flowing descriptive paragraph without markdown asterisks or bullet points.

Format your response as:
TEMPLATE:
[Your WhatsApp message here]

IMAGE_PROMPT:
[Your detailed image generation prompt here]`;
    } else if (type === "message_suggestion") {
      systemPrompt =
        `You are a helpful WhatsApp Business assistant. Generate professional, friendly, and contextually appropriate message suggestions.`;

      userPrompt =
        `Generate a professional WhatsApp message suggestion for contacting ${
          context?.contactName || "a customer"
        }.
${
          context?.recentMessages?.length
            ? `Recent conversation context: ${
              context.recentMessages.join(" | ")
            }`
            : "This is a new conversation."
        }

Provide a single message that is:
- Professional and friendly
- Relevant to business context
- Under 200 characters
- Includes appropriate emoji`;
    } else {
      throw new Error("Invalid type specified");
    }

    let response: Response;
    let usedProvider = textProvider || "lovable_ai";

    async function callLovableAI(): Promise<Response> {
      console.log("Calling Lovable AI Gateway...");
      return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
    }

    async function callGemini(): Promise<Response> {
      console.log("Calling Google Gemini API directly...");
      // Prefer user key, fallback to server-side GOOGLE_API_KEY
      let geminiKey: string;
      try {
        geminiKey = await getUserApiKey(req, "gemini_api_key");
      } catch (_e) {
        const serverKey = Deno.env.get("GOOGLE_API_KEY");
        if (!serverKey) throw _e;
        console.log("Using server-side GOOGLE_API_KEY fallback");
        geminiKey = serverKey;
      }
      const geminiModels = [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-flash-latest",
        "gemini-2.0-flash",
      ];
      let lastResponse: Response | null = null;

      for (const model of geminiModels) {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
                },
              ],
              generationConfig: { maxOutputTokens: 8192 },
            }),
          },
        );

        if (response.ok) {
          console.log(`Gemini model succeeded: ${model}`);
          return response;
        }

        const errorText = await response.text();
        console.error(
          `Gemini model failed [${model}]:`,
          response.status,
          errorText,
        );
        lastResponse = new Response(errorText, {
          status: response.status,
          headers: {
            "Content-Type": response.headers.get("Content-Type") ||
              "text/plain",
          },
        });

        // Try next model on transient/availability errors
        if (![400, 404, 429, 500, 502, 503, 504].includes(response.status)) {
          return lastResponse;
        }
      }

      return lastResponse ??
        new Response("Gemini request failed", { status: 500 });
    }

    if (textProvider === "gemini") {
      try {
        response = await callGemini();
      } catch (e) {
        console.error("Gemini call failed, falling back to Lovable AI:", e);
        response = await callLovableAI();
        usedProvider = "lovable_ai";
      }
      // If Gemini returned an error, fallback to Lovable AI
      if (!response.ok) {
        const status = response.status;
        console.error(
          `Gemini API error ${status}, falling back to Lovable AI...`,
        );
        try {
          response = await callLovableAI();
          usedProvider = "lovable_ai";
        } catch (fallbackErr) {
          console.error("Lovable AI fallback also failed:", fallbackErr);
          return new Response(
            JSON.stringify({
              error:
                "Google Gemini failed, and Lovable AI fallback is currently unavailable. Please try Gemini again shortly or check workspace AI credits.",
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }
    } else {
      response = await callLovableAI();
      // If Lovable AI fails, try Gemini as fallback
      if (!response.ok) {
        const status = response.status;
        console.error(`Lovable AI error ${status}, trying Gemini fallback...`);
        try {
          response = await callGemini();
          usedProvider = "gemini";
        } catch (geminiErr) {
          console.error("Gemini fallback failed:", geminiErr);
          return new Response(
            JSON.stringify({
              error:
                "AI credits exhausted and Gemini fallback failed. Please add credits or check your Gemini API key.",
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("All AI providers failed:", response.status, errorText);
      const isGeminiError = usedProvider === "gemini";
      const errorMessage = response.status === 429
        ? `${
          isGeminiError ? "Google Gemini" : "Lovable AI"
        } rate limit exceeded. Please wait and try again.`
        : response.status === 401 || response.status === 403
        ? `${
          isGeminiError ? "Google Gemini" : "Lovable AI"
        } authentication failed. Please verify your API setup.`
        : response.status === 402
        ? "Lovable AI credits are exhausted. Please top up workspace usage or switch back to Google Gemini."
        : `${isGeminiError ? "Google Gemini" : "Lovable AI"} failed: ${
          errorText.substring(0, 200)
        }`;

      return new Response(
        JSON.stringify({ error: errorMessage }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await response.json();
    // Parse content from either Gemini native or OpenAI-compatible format
    const content = usedProvider === "gemini"
      ? (data.candidates?.[0]?.content?.parts?.[0]?.text || "")
      : (data.choices?.[0]?.message?.content || "");

    console.log("AI response received:", content.substring(0, 200));

    if (type === "marketing_template") {
      const templateMatch = content.match(
        /TEMPLATE:\s*([\s\S]*?)(?=IMAGE_PROMPT:|$)/i,
      );
      const imagePromptMatch = content.match(/IMAGE_PROMPT:\s*([\s\S]*?)$/i);

      const template = templateMatch?.[1]?.trim() || content;
      const hasDiscount = discount && discount > 0;
      const generatedImagePrompt = imagePromptMatch?.[1]?.trim() ||
        (hasDiscount
          ? `Promotional poster for ${businessType} ${occasion} sale with ${discount}% discount, Indian festive theme, professional marketing design`
          : `Promotional poster for ${businessType} ${occasion} celebration, product showcase, Indian festive theme, professional marketing design`);

      return new Response(
        JSON.stringify({ template, imagePrompt: generatedImagePrompt }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } else {
      return new Response(
        JSON.stringify({ content }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (error) {
    console.error("Error in generate-template:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An error occurred",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
