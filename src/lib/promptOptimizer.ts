/**
 * Prompt Optimizer for AI Image Generation (FLUX, SDXL, Midjourney style).
 * Cleans and converts textual or LLM-generated prompts into photorealistic commercial image prompts:
 * - Strips LLM markdown artifacts (**Central Focus:**, bullet points, headers)
 * - Removes nonsensical "0% OFF" discount tags
 * - Guides diffusion models away from garbled chat UI / distorted fake text
 * - Adds commercial advertising lighting, composition, and studio aesthetics
 */

export function optimizeMarketingImagePrompt(
  rawPrompt: string,
  opts?: {
    businessType?: string;
    occasion?: string;
    discount?: number;
  },
): string {
  if (!rawPrompt || !rawPrompt.trim()) return "";

  let prompt = rawPrompt.trim();

  // 1. Remove leading LLM tags like "IMAGE_PROMPT:", "PROMPT:", etc.
  prompt = prompt.replace(/^(IMAGE_PROMPT|PROMPT|IMAGE GENERATION PROMPT):\s*/i, "");

  // 2. Remove markdown bold/italic headers like **Central Focus:**, **Visual Theme:**
  prompt = prompt.replace(/\*\*[^*]+:\*\*/gi, "");
  prompt = prompt.replace(/\*\*[^*]+\*\*/g, (match) => match.replace(/\*\*/g, ""));
  prompt = prompt.replace(/\*[^*]+\*/g, (match) => match.replace(/\*/g, ""));
  prompt = prompt.replace(/^[#*-]\s+/gm, "");

  // 3. Remove accidental "0% OFF" or "0% discount"
  prompt = prompt.replace(/\b0%\s*(off|discount|sale)\b/gi, "");
  prompt = prompt.replace(/\bdiscount\s*:\s*0%\b/gi, "");

  // 4. Transform complex UI chat screen descriptions into clean commercial advertising visuals
  // Diffusion models cannot render readable paragraphs or chat bubbles without severe distortion.
  prompt = prompt.replace(
    /showcasing a dynamic,\s*clean\s*(whatsapp|instagram|chat)\s*(chat\s*)?interface\s*on\s*its\s*screen/gi,
    "displaying a glowing minimalist digital gradient screen with modern notification badge"
  );
  prompt = prompt.replace(
    /chat\s*bubbles?\s*(with\s*messages?|conversation)?/gi,
    "floating glowing holographic icons"
  );
  prompt = prompt.replace(
    /paragraphs?\s*of\s*(chat\s*)?text/gi,
    "clean minimalist layout"
  );

  // 5. Clean up extra punctuation, newlines, and bullet spacing
  prompt = prompt
    .replace(/\r?\n+/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,(\s*,)+/g, ", ")
    .trim();
  prompt = prompt.replace(/^,\s*/, "").replace(/,\s*$/, "");

  // 6. Append commercial advertising quality enhancers if not already present
  const enhancers: string[] = [];
  if (!/commercial|advertisement|poster/i.test(prompt)) {
    enhancers.push("commercial promotional poster");
  }
  if (!/lighting|studio|glow/i.test(prompt)) {
    enhancers.push("studio lighting, vibrant colors");
  }
  if (!/clean|negative space|minimalist/i.test(prompt)) {
    enhancers.push("clean composition, ample negative space for text overlay");
  }
  if (!/photorealistic|8k|hyper-detailed|3d render/i.test(prompt)) {
    enhancers.push("high resolution, professional commercial photography");
  }

  if (enhancers.length > 0) {
    prompt = `${prompt}, ${enhancers.join(", ")}`;
  }

  // 7. Ensure clean discount handling
  if (typeof opts?.discount === "number" && opts.discount > 0) {
    if (!prompt.includes(`${opts.discount}%`)) {
      prompt = `${prompt}, bold elegant badge with "${opts.discount}% OFF"`;
    }
  }

  return prompt.trim();
}
