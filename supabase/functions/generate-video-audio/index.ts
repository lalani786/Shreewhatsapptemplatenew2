import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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

async function synthesizeFullVoice(text: string): Promise<Uint8Array | null> {
  const lang = /[\u0900-\u097F]/.test(text) ? "hi" : "en";
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];
  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if (trimmed.length <= 85) {
      chunks.push(trimmed);
    } else {
      const words = trimmed.split(/\s+/);
      let cur = "";
      for (const w of words) {
        if ((cur + " " + w).trim().length <= 85) {
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
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
      if (r.ok) {
        const b = new Uint8Array(await r.arrayBuffer());
        if (b.length > 500) {
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
    const { voiceText, musicPrompt, voiceId, musicDurationSeconds, action, apiKey: userApiKey } = body;

    if (action === "free_tts") {
      const trimmed = (voiceText || "").toString().trim();
      if (!trimmed) return json({ error: "voiceText is required" }, 200);
      const audioBytes = await synthesizeFullVoice(trimmed);
      if (!audioBytes) return json({ error: "Could not generate full voice audio" }, 200);
      return json({
        voiceAudio: base64Encode(audioBytes),
        voiceNotice: "Full voiceover generated using free backup engine.",
      }, 200);
    }

    const apiKey = (userApiKey as string | undefined)?.trim() || Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) return json({ error: "ELEVENLABS_API_KEY is not configured" }, 200);

    // Permission pre-check: probes TTS + Music endpoints minimally without consuming credits.
    if (action === "check") {
      const result: { tts: boolean; music: boolean; ttsError?: string; musicError?: string } = {
        tts: false,
        music: false,
      };

      // TTS probe — tiny text
      try {
        const r = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId || DEFAULT_VOICE_ID}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ text: ".", model_id: "eleven_multilingual_v2" }),
          }
        );
        if (r.ok) {
          result.tts = true;
          await r.arrayBuffer(); // drain
        } else {
          const t = await r.text();
          if (r.status === 401 && t.includes("missing_permissions")) {
            result.ttsError = "API key is missing the 'text_to_speech' permission.";
          } else {
            // Any non-permission error means the key CAN reach the endpoint
            result.tts = !t.includes("missing_permissions");
            if (!result.tts) result.ttsError = t.slice(0, 200);
          }
        }
      } catch (e) {
        result.ttsError = e instanceof Error ? e.message : String(e);
      }

      // Music probe — invalid duration triggers validation, no credits used
      try {
        const r = await fetch("https://api.elevenlabs.io/v1/music", {
          method: "POST",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "test", music_length_ms: 1 }),
        });
        const t = await r.text();
        if (r.status === 401 && t.includes("missing_permissions")) {
          result.musicError = "API key is missing the 'music_generation' permission.";
        } else if (r.status === 402 || t.includes("paid_plan_required")) {
          result.music = false;
          result.musicError = "Music API requires an ElevenLabs paid plan. Voiceover is fully available on free accounts.";
        } else {
          // 422/400 (validation) or 200 means permission is OK
          result.music = !t.includes("missing_permissions");
          if (!result.music && !result.musicError) result.musicError = t.slice(0, 200);
        }
      } catch (e) {
        result.musicError = e instanceof Error ? e.message : String(e);
      }

      return json(result, 200);
    }

    const trimmedVoice = (voiceText || "").toString().trim();
    const trimmedMusic = (musicPrompt || "").toString().trim();
    if (!trimmedVoice && !trimmedMusic) {
      return json({ error: "voiceText or musicPrompt is required" }, 200);
    }

    const result: { voiceAudio?: string; musicAudio?: string; voiceError?: string; musicError?: string } = {};

    // Voiceover (TTS)
    if (trimmedVoice) {
      try {
        const ttsRes = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId || DEFAULT_VOICE_ID}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              text: trimmedVoice.slice(0, 1500),
              model_id: "eleven_multilingual_v2",
              voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
            }),
          }
        );
        if (!ttsRes.ok) {
          const errText = await ttsRes.text();
          console.error("TTS error:", ttsRes.status, errText);
          const isQuota = errText.includes("quota_exceeded");
          result.voiceError = `Voiceover failed (${ttsRes.status}): ${errText.slice(0, 200)}`;

          // Generate full complete voiceover using multi-chunk backup engine
          try {
            console.log("ElevenLabs error, synthesizing complete voiceover with multi-chunk engine...");
            const fullAudio = await synthesizeFullVoice(trimmedVoice);
            if (fullAudio) {
              result.voiceAudio = base64Encode(fullAudio);
              result.voiceNotice = isQuota
                ? "ElevenLabs monthly quota exceeded. Full voiceover generated using backup audio engine."
                : "Full voiceover generated using backup audio engine.";
              delete result.voiceError;
            }
          } catch (fbErr) {
            console.error("Fallback TTS error:", fbErr);
          }
        } else {
          const buf = await ttsRes.arrayBuffer();
          result.voiceAudio = base64Encode(new Uint8Array(buf));
        }
      } catch (e) {
        result.voiceError = e instanceof Error ? e.message : String(e);
      }
    }

    // Music
    if (trimmedMusic) {
      try {
        const musicRes = await fetch("https://api.elevenlabs.io/v1/music", {
          method: "POST",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: trimmedMusic,
            music_length_ms: Math.max(10000, Math.min(60000, (musicDurationSeconds || 10) * 1000)),
          }),
        });
        if (!musicRes.ok) {
          const errText = await musicRes.text();
          console.error("Music error:", musicRes.status, errText);
          if (musicRes.status === 402 || errText.includes("paid_plan_required")) {
            result.musicError = "ElevenLabs Music API requires a paid plan. Voiceover generated without background music.";
          } else {
            result.musicError = `Music failed (${musicRes.status}): ${errText.slice(0, 200)}`;
          }
        } else {
          const buf = await musicRes.arrayBuffer();
          result.musicAudio = base64Encode(new Uint8Array(buf));
        }
      } catch (e) {
        result.musicError = e instanceof Error ? e.message : String(e);
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
