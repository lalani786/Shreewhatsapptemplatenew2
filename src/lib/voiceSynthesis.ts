import { supabase } from "@/integrations/supabase/client";

export interface VoiceSynthesisOptions {
  text: string;
  language: string; // e.g. "hi-IN", "gu-IN", "ur-PK", "ar-SA", "en-US"
  voiceGender?: "male" | "female";
  voiceId?: string;
  elevenLabsKey?: string;
}

export interface VoiceSynthesisResult {
  audioBase64: string;
  provider: "elevenlabs" | "native-google";
  notice?: string;
}

function resolveLangCode(language: string, text: string): string {
  const l = (language || "").toLowerCase();
  if (l.startsWith("hi")) return "hi";
  if (l.startsWith("gu")) return "gu";
  if (l.startsWith("ur")) return "ur";
  if (l.startsWith("ar")) return "ar";
  if (l.startsWith("en")) return "en";

  // Infer from script characters
  if (/[\u0A80-\u0AFF]/.test(text)) return "gu";
  if (/[\u0679\u067E\u0686\u0688\u0691\u0698\u06A9\u06AF\u06BA\u06BE\u06CC\u06D2]/.test(text)) return "ur";
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  return "en";
}

/**
 * Validates whether the text matches the writing system of the requested language.
 */
export function validateScriptForLanguage(text: string, language: string): {
  isValid: boolean;
  expectedScript: string;
  warning?: string;
} {
  const code = resolveLangCode(language, text);
  switch (code) {
    case "gu":
      if (!/[\u0A80-\u0AFF]/.test(text)) {
        return {
          isValid: false,
          expectedScript: "Gujarati (ગુજરાતી)",
          warning: "Script does not contain Gujarati characters (ગુજરાતી લિપિ). Generating in Gujarati audio voice.",
        };
      }
      return { isValid: true, expectedScript: "Gujarati" };
    case "ur":
      if (!/[\u0600-\u06FF]/.test(text)) {
        return {
          isValid: false,
          expectedScript: "Urdu (اردو)",
          warning: "Script does not contain Urdu Nastaliq characters. Generating in Urdu audio voice.",
        };
      }
      return { isValid: true, expectedScript: "Urdu" };
    case "ar":
      if (!/[\u0600-\u06FF]/.test(text)) {
        return {
          isValid: false,
          expectedScript: "Arabic (العربية)",
          warning: "Script does not contain Arabic characters. Generating in Arabic audio voice.",
        };
      }
      return { isValid: true, expectedScript: "Arabic" };
    case "hi":
      if (!/[\u0900-\u097F]/.test(text)) {
        return {
          isValid: false,
          expectedScript: "Hindi Devanagari (देवनागरी)",
          warning: "Script does not contain Devanagari characters. Generating in Hindi audio voice.",
        };
      }
      return { isValid: true, expectedScript: "Hindi Devanagari" };
    default:
      return { isValid: true, expectedScript: "English" };
  }
}

/**
 * Client-side synthesis fallback fetching chunks through /api/tts or direct translate_tts
 */
async function synthesizeClientFallback(text: string, langCode: string): Promise<string> {
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?।۔\n]+[.!?।۔\n]+|[^.!?।۔\n]+$/g) || [text];

  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if (trimmed.length <= 80) {
      chunks.push(trimmed);
    } else {
      const words = trimmed.split(/\s+/);
      let cur = "";
      for (const w of words) {
        if ((cur + " " + w).trim().length <= 80) {
          cur = (cur + " " + w).trim();
        } else {
          if (cur) chunks.push(cur);
          cur = w;
        }
      }
      if (cur) chunks.push(cur);
    }
  }

  const bufs: Uint8Array[] = [];
  let totalLen = 0;

  for (const chunk of chunks) {
    const query = encodeURIComponent(chunk);
    const candidateUrls = import.meta.env.DEV
      ? [`/api/tts/translate_tts?ie=UTF-8&q=${query}&tl=${langCode}&client=tw-ob`]
      : [
          `https://translate.google.com/translate_tts?ie=UTF-8&q=${query}&tl=${langCode}&client=tw-ob`,
          `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${query}&tl=${langCode}&client=tw-ob`,
        ];

    let chunkBlob: Blob | null = null;
    for (const url of candidateUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          chunkBlob = await res.blob();
          break;
        }
      } catch (err) {
        console.warn(`TTS fetch failed on ${url}:`, err);
      }
    }

    if (chunkBlob && chunkBlob.size > 200) {
      const arrayBuf = await chunkBlob.arrayBuffer();
      const u8 = new Uint8Array(arrayBuf);
      bufs.push(u8);
      totalLen += u8.length;
    }
  }

  if (bufs.length === 0) {
    throw new Error(`Could not synthesize audio for language ${langCode}`);
  }

  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const b of bufs) {
    merged.set(b, offset);
    offset += b.length;
  }

  // Convert Uint8Array to base64
  let binary = "";
  const len = merged.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(merged[i]);
  }
  return btoa(binary);
}

/**
 * Synthesizes voice audio in the user's selected language.
 * Strictly avoids replacing Gujarati, Urdu, or Arabic voices with English.
 */
export async function synthesizeVoiceAudio(
  options: VoiceSynthesisOptions
): Promise<VoiceSynthesisResult> {
  const { text, language, voiceGender = "female", voiceId, elevenLabsKey } = options;
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Voiceover text is empty");

  const langCode = resolveLangCode(language, trimmed);

  // 1. Try Supabase Edge Function generate-video-audio
  try {
    const res = await supabase.functions.invoke("generate-video-audio", {
      body: {
        voiceText: trimmed,
        voiceId,
        language,
        voiceGender,
        apiKey: elevenLabsKey || undefined,
      },
    });

    if (res.data?.voiceAudio) {
      return {
        audioBase64: res.data.voiceAudio,
        provider: langCode === "gu" || langCode === "ur" ? "native-google" : (elevenLabsKey ? "elevenlabs" : "native-google"),
        notice: res.data.voiceNotice,
      };
    }
  } catch (edgeErr) {
    console.warn("Supabase edge function generate-video-audio error:", edgeErr);
  }

  // 2. Client-side verified fallback
  const base64Audio = await synthesizeClientFallback(trimmed, langCode);
  return {
    audioBase64: base64Audio,
    provider: "native-google",
    notice: `Synthesized with authentic ${langCode.toUpperCase()} speech engine.`,
  };
}
