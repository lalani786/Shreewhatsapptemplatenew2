import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SYSTEM_PROMPT = `You are Photo Studio AI, a professional AI image-generation assistant for product photography, ecommerce catalogs, social media marketing, advertisements, banners, posters, and business promotions.

## 1. Main Objective
Generate vivid, production-grade image-generation prompts that accurately match the user's requested subject, product, style, background, colors, composition, and intended use.
Never use a fixed example prompt for every request. Never default to cats, animals, or any unrelated subject unless explicitly requested by the user.

## 2. Understand the User's Request
1. Identify the exact subject or product.
2. Identify the image purpose (ecommerce catalog, product photography, advertising, social media promotion).
3. Understand requested background, colors, lighting, style, and composition.
4. Improve vague prompts while strictly preserving the user's original intent.
Examples:
- "Shoes ki photo banao" -> Professional footwear product photography on clean minimalist studio pedestal with soft rim lighting.
- "Diwali sale banner" -> Festive Diwali advertising creative with decorative warm diyas, subtle marigold accents, and golden lighting.
- "Kurti catalog photo" -> Professional Indian ethnic garment catalog photography on mannequin or model, studio backdrop.
- "Medical shop promotion" -> Clean healthcare & pharmacy promotional visual with wellness atmosphere.
- "Orange cat" -> Generate a cat only because the user requested one.

## 3. Professional Quality Standards
- High-quality studio lighting, realistic textures, natural shadows, sharp subject focus.
- Commercial-quality presentation. Clean background.
- No unwanted watermarks, duplicate objects, distorted products, or irrelevant subjects.
- No unrequested logos or watermarks (no Shree Photo Studio watermark, no Tally branding).

## 4. Output Format
Output ONLY the final image generation prompt text (1-3 sentences, 40-70 words). Output nothing else — no preamble, no quotes, no labels.`;

/** Generate a prompt using Google Gemini API */
async function generateWithGemini(apiKey: string, userMsg: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userMsg }] }],
        generationConfig: { maxOutputTokens: 160, temperature: 0.75 },
      }),
    }
  );
  if (!res.ok) {
    const t = await res.text();
    console.error("Gemini API error:", res.status, t);
    throw new Error(`Gemini API failed (${res.status})`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("No text from Gemini");
  return text;
}

/** Fallback: Lovable AI gateway */
async function generateWithLovable(lovableKey: string, userMsg: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("Lovable AI gateway error:", res.status, t);
    if (res.status === 429) throw new Error("Rate limit exceeded. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    throw new Error(`AI gateway failed (${res.status})`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("No text from Lovable AI");
  return text;
}

/** Last-resort: generate a prompt locally matching Photo Studio AI guidelines */
function generateLocalPrompt(category: string, style: string, hint?: string): string {
  const cat = category || "product";
  const sty = style || "editorial";

  if (hint && hint.trim()) {
    const cleanHint = hint.trim();
    return `Professional commercial ${sty} photoshoot of ${cleanHint}, studio lighting with soft highlights and natural shadows, high-resolution textures, clean minimalist backdrop, sharp focus on subject, commercial ecommerce catalog quality, no watermarks, no distorted objects.`;
  }

  return `High-end ${sty} photoshoot for ${cat} commercial advertising, professional studio lighting, realistic textures, clean composition, crisp focus on subject, premium ecommerce catalog presentation, no watermarks.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { category, style, hint } = await req.json();
    const userMsg = `Category: ${category || "general"}\nStyle: ${style || "editorial"}${hint ? `\nUser hint: ${hint}` : ""}\n\nWrite the prompt now.`;

    // ── Step 1: Fetch user's Gemini API key from DB ───────────────────────────
    let geminiKey: string | null = null;
    const authHeader = req.headers.get("Authorization");

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
            .select("gemini_api_key")
            .eq("user_id", user.id)
            .maybeSingle();
          geminiKey = data?.gemini_api_key || null;
        }
      } catch (e) {
        console.warn("Could not fetch user credentials:", e);
      }
    }

    const resolvedGeminiKey = geminiKey || Deno.env.get("GEMINI_API_KEY") || null;

    // ── Step 2: Try Gemini ────────────────────────────────────────────────────
    if (resolvedGeminiKey) {
      try {
        const prompt = await generateWithGemini(resolvedGeminiKey, userMsg);
        return json({ prompt }, 200);
      } catch (err: any) {
        console.warn("Gemini failed, trying Lovable AI:", err.message);
      }
    }

    // ── Step 3: Try Lovable AI gateway ───────────────────────────────────────
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY) {
      try {
        const prompt = await generateWithLovable(LOVABLE_API_KEY, userMsg);
        return json({ prompt }, 200);
      } catch (err: any) {
        console.warn("Lovable AI failed, using local fallback:", err.message);
      }
    }

    // ── Step 4: Local template fallback (always works) ───────────────────────
    const prompt = generateLocalPrompt(category || "product", style || "editorial", hint);
    return json({ prompt, fallback: true }, 200);

  } catch (e) {
    console.error("generate-prompt error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
