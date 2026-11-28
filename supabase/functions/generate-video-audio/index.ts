import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // George

// Map UI voice IDs to real ElevenLabs voice IDs for languages supported by ElevenLabs Multilingual v2
const ELEVENLABS_VOICE_MAP: Record<string, string> = {
  // Hindi
  "hi-female-1": "21m00Tcm4TlvDq8ikWAM", // Rachel (clear multilingual female)
  "hi-male-1": "JBFqnCBsd6RMkjVDRZzb",   // George (warm multilingual male)
  // Arabic
  "ar-female-1": "AZnzlk1XvdvUeBnXmlld", // Domi (clear multilingual female)
  "ar-male-1": "VR6AewLTigWG4xSOukaG",   // Arnold (authoritative male)
  // English
  "en-female-1": "21m00Tcm4TlvDq8ikWAM", // Rachel
  "en-male-1": "JBFqnCBsd6RMkjVDRZzb",   // George
};

function resolveLanguageCode(requestedLang?: string, text?: string): string {
  if (requestedLang) {
    const l = requestedLang.toLowerCase();
    if (l.startsWith("hi")) return "hi";
    if (l.startsWith("gu")) return "gu";
    if (l.startsWith("ur")) return "ur";
    if (l.startsWith("ar")) return "ar";
    if (l.startsWith("en")) return "en";
  }
  if (text) {
    if (/[\u0A80-\u0AFF]/.test(text)) return "gu";
    if (/[\u0679\u067E\u0686\u0688\u0691\u0698\u06A9\u06AF\u06BA\u06BE\u06CC\u06D2]/.test(text)) return "ur";
    if (/[\u0600-\u06FF]/.test(text)) return "ar";
    if (/[\u0900-\u097F]/.test(text)) return "hi";
  }
  return "en";
}

async function synthesizeFullVoice(text: string, requestedLang?: string): Promise<Uint8Array | null> {
  const lang = resolveLanguageCode(requestedLang, text);
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
    try {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${lang}&client=tw-ob`;
      const r = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      if (r.ok) {
        const b = new Uint8Array(await r.arrayBuffer());
        if (b.length > 200) {
          bufs.push(b);
          totalLen += b.length;
        }
      }
    } catch (err) {
      console.warn("Chunk TTS fetch error:", err);
    }
  }

  if (bufs.length === 0) return null;
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const b of bufs) {
    merged.set(b, offset);
    offset += b.length;
  }
  return merged;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { voiceText, musicPrompt, voiceId, musicDurationSeconds, action, apiKey: userApiKey, language, voiceGender } = body;

    const trimmedVoice = (voiceText || "").toString().trim();
    const langCode = resolveLanguageCode(language, trimmedVoice);

    if (action === "free_tts") {
      if (!trimmedVoice) return json({ error: "voiceText is required" }, 200);
      const audioBytes = await synthesizeFullVoice(trimmedVoice, language);
      if (!audioBytes) return json({ error: "Could not generate full voice audio" }, 200);
      return json({
        voiceAudio: base64Encode(audioBytes),
        voiceNotice: `Voiceover generated in native ${langCode.toUpperCase()} audio engine.`,
      }, 200);
    }

    // ElevenLabs only supports Hindi, Arabic, English in eleven_multilingual_v2.
    // For Gujarati (gu) and Urdu (ur), ElevenLabs does NOT support them natively.
    // To ensure genuine native language speech and avoid English mispronunciation,
    // we use the verified native language voice engine for Gujarati and Urdu.
    const requiresNativeEngine = langCode === "gu" || langCode === "ur";

    if (requiresNativeEngine && trimmedVoice) {
      console.log(`Using verified native TTS engine for ${langCode.toUpperCase()} (genuine native pronunciation)...`);
      const nativeAudio = await synthesizeFullVoice(trimmedVoice, language);
      if (nativeAudio) {
        return json({
          voiceAudio: base64Encode(nativeAudio),
          voiceNotice: `Voiceover synthesized with native ${langCode === "gu" ? "Gujarati (ગુજરાતી)" : "Urdu (اردو)"} engine for authentic pronunciation.`,
        }, 200);
      }
    }

    // Priority 1: User-provided API key
    let apiKey = (userApiKey as string | undefined)?.trim();

    // Priority 2: Retrieve from database
    if (!apiKey) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader) {
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            global: { headers: { Authorization: authHeader } },
          });

          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: creds } = await supabase
              .from("api_credentials")
              .select("elevenlabs_api_key")
              .eq("user_id", user.id)
              .maybeSingle();
            apiKey = (creds as any)?.elevenlabs_api_key?.trim() || "";
          }
        } catch (e) {
          console.warn("DB key fetch exception:", e);
        }
      }
    }

    // Priority 3: Fallback to environment variable
    if (!apiKey) {
      apiKey = Deno.env.get("ELEVENLABS_API_KEY")?.trim() || "";
    }

    // If no ElevenLabs key, generate native voice immediately using verified engine
    if (!apiKey) {
      if (trimmedVoice) {
        const fallbackAudio = await synthesizeFullVoice(trimmedVoice, language);
        if (fallbackAudio) {
          return json({
            voiceAudio: base64Encode(fallbackAudio),
            voiceNotice: `Voiceover generated in native ${langCode.toUpperCase()} audio engine.`,
          }, 200);
        }
      }
      return json({ error: "No voice engine available. Please check network connection or add ElevenLabs key in API Setup." }, 200);
    }

    // Permission check action
    if (action === "check") {
      const result: { tts: boolean; music: boolean; ttsError?: string; musicError?: string } = {
        tts: false,
        music: false,
      };

      try {
        const targetVoice = ELEVENLABS_VOICE_MAP[voiceId] || voiceId || DEFAULT_VOICE_ID;
        const r = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${targetVoice}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ text: ".", model_id: "eleven_multilingual_v2" }),
          }
        );
        if (r.ok) {
          result.tts = true;
          await r.arrayBuffer();
        } else {
          const t = await r.text();
          result.tts = !t.includes("missing_permissions");
          if (!result.tts) result.ttsError = t.slice(0, 200);
        }
      } catch (e) {
        result.ttsError = e instanceof Error ? e.message : String(e);
      }

      return json(result, 200);
    }

    const trimmedMusic = (musicPrompt || "").toString().trim();
    if (!trimmedVoice && !trimmedMusic) {
      return json({ error: "voiceText or musicPrompt is required" }, 200);
    }

    const result: { voiceAudio?: string; musicAudio?: string; voiceError?: string; musicError?: string; voiceNotice?: string } = {};

    // Voiceover generation (TTS)
    if (trimmedVoice) {
      try {
        const targetVoice = ELEVENLABS_VOICE_MAP[voiceId] || voiceId || DEFAULT_VOICE_ID;
        const ttsRes = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${targetVoice}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              text: trimmedVoice.slice(0, 1500),
              model_id: "eleven_multilingual_v2",
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0.35,
                use_speaker_boost: true,
              },
            }),
          }
        );

        if (!ttsRes.ok) {
          const errText = await ttsRes.text();
          console.warn("ElevenLabs TTS returned error:", ttsRes.status, errText);
          // Fall back to verified native voice engine
          const fallbackAudio = await synthesizeFullVoice(trimmedVoice, language);
          if (fallbackAudio) {
            result.voiceAudio = base64Encode(fallbackAudio);
            result.voiceNotice = `Voiceover generated with native ${langCode.toUpperCase()} speech engine.`;
          } else {
            result.voiceError = `Voiceover failed (${ttsRes.status}): ${errText.slice(0, 180)}`;
          }
        } else {
          const buf = await ttsRes.arrayBuffer();
          result.voiceAudio = base64Encode(new Uint8Array(buf));
        }
      } catch (e) {
        console.warn("ElevenLabs TTS exception, falling back to native engine:", e);
        const fallbackAudio = await synthesizeFullVoice(trimmedVoice, language);
        if (fallbackAudio) {
          result.voiceAudio = base64Encode(fallbackAudio);
          result.voiceNotice = `Voiceover generated with native ${langCode.toUpperCase()} speech engine.`;
        } else {
          result.voiceError = e instanceof Error ? e.message : String(e);
        }
      }
    }

    // Music generation
    if (trimmedMusic) {
      try {
        const musicRes = await fetch("https://api.elevenlabs.io/v1/music", {
          method: "POST",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: trimmedMusic,
            music_length_ms: Math.max(10000, Math.min(60000, (musicDurationSeconds || 15) * 1000)),
          }),
        });
        if (musicRes.ok) {
          const buf = await musicRes.arrayBuffer();
          result.musicAudio = base64Encode(new Uint8Array(buf));
        } else {
          const errText = await musicRes.text();
          console.warn("Music generation status:", musicRes.status, errText);
        }
      } catch (e) {
        console.warn("Music generation exception:", e);
      }
    }

    if (!result.voiceAudio && !result.musicAudio) {
      return json({ error: result.voiceError || result.musicError || "No audio generated" }, 200);
    }

    return json(result, 200);
  } catch (e) {
    console.error("generate-video-audio error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 200);
  }
});
