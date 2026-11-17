import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

interface UserCredentials {
  runwayKey?: string;
  geminiKey?: string;
  pexelsKey?: string;
}

async function getUserCredentials(req: Request): Promise<UserCredentials> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return {};

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return {};

    const { data: creds } = await supabase
      .from("api_credentials")
      .select("runway_api_key, gemini_api_key, pexels_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    return {
      runwayKey: (creds as any)?.runway_api_key?.trim() || undefined,
      geminiKey: (creds as any)?.gemini_api_key?.trim() || undefined,
      pexelsKey: (creds as any)?.pexels_api_key?.trim() || undefined,
    };
  } catch (err) {
    console.warn("Could not load credentials from DB:", err);
    return {};
  }
}

async function generateWithRunway(options: {
  apiKey: string;
  promptText: string;
  imageUrl?: string;
  durationSeconds?: number;
  aspectRatio?: string;
}): Promise<{ videoUrl: string; taskId: string; duration: number }> {
  const { apiKey, promptText, imageUrl, durationSeconds = 5, aspectRatio = "9:16" } = options;
  const cleanKey = apiKey.replace(/^Bearer\s+/i, "").trim();

  const runwayRatio = aspectRatio === "9:16" ? "768:1280" : "1280:768";
  const runwayDuration = durationSeconds >= 10 ? 10 : 5;

  const requestBody: Record<string, any> = {
    promptText,
    model: "gen3a_turbo",
    duration: runwayDuration,
    ratio: runwayRatio,
  };

  if (imageUrl && (imageUrl.startsWith("https://") || imageUrl.startsWith("http://"))) {
    requestBody.promptImage = imageUrl;
  }

  // Developer keys (key_...) use api.dev.runwayml.com; production keys use api.runwayml.com
  const candidateBases = ["https://api.dev.runwayml.com", "https://api.runwayml.com"];
  let chosenBase = candidateBases[0];
  let res: Response | null = null;
  let lastError = "";

  for (const base of candidateBases) {
    try {
      const attempt = await fetch(`${base}/v1/image_to_video`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cleanKey}`,
          "Content-Type": "application/json",
          "X-Runway-Version": "2024-09-13",
        },
        body: JSON.stringify(requestBody),
      });

      if (attempt.ok) {
        res = attempt;
        chosenBase = base;
        break;
      }

      const errText = await attempt.text();
      if (errText.includes("Incorrect hostname for API key")) {
        console.warn(`Runway returned Incorrect hostname on ${base}, testing alternate host...`);
        lastError = errText;
        continue;
      }

      lastError = errText;
      break;
    } catch (e: any) {
      lastError = e?.message || String(e);
    }
  }

  if (!res || !res.ok) {
    let parsedMsg = lastError;
    try {
      const j = JSON.parse(lastError);
      parsedMsg = j.error || j.message || lastError;
    } catch {}
    throw new Error(`Runway API error: ${parsedMsg}`);
  }

  const taskData = await res.json();
  const taskId = taskData.id;
  if (!taskId) throw new Error("Runway did not return a valid task ID");

  console.log(`Runway task created: ${taskId}. Polling on ${chosenBase}...`);

  // Asynchronous polling
  let videoUrl = "";
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const checkRes = await fetch(`${chosenBase}/v1/tasks/${taskId}`, {
        headers: {
          Authorization: `Bearer ${cleanKey}`,
          "X-Runway-Version": "2024-09-13",
        },
      });

      if (!checkRes.ok) {
        const t = await checkRes.text();
        console.warn(`Runway poll HTTP ${checkRes.status}:`, t);
        continue;
      }

      const checkData = await checkRes.json();
      if (checkData.status === "SUCCEEDED" && checkData.output?.[0]) {
        videoUrl = checkData.output[0];
        break;
      }
      if (checkData.status === "FAILED") {
        throw new Error(
          `Runway video generation failed: ${checkData.failure || checkData.failureCode || "Generation failed"}`
        );
      }
    } catch (pollErr: any) {
      if (pollErr.message?.includes("Runway video generation failed")) {
        throw pollErr;
      }
      console.warn("Runway poll attempt error:", pollErr);
    }
  }

  if (!videoUrl) {
    throw new Error("Runway video generation timed out (135s limit). Please check your Runway task dashboard.");
  }

  return { videoUrl, taskId, duration: runwayDuration };
}

async function searchPexelsVideo(options: {
  apiKey: string;
  query: string;
  aspectRatio?: string;
}): Promise<string> {
  const { apiKey, query, aspectRatio = "9:16" } = options;
  const orientation = aspectRatio === "9:16" ? "portrait" : aspectRatio === "16:9" ? "landscape" : "square";
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=5`;

  const r = await fetch(url, {
    headers: { Authorization: apiKey },
  });

  if (!r.ok) {
    throw new Error(`Pexels API error (${r.status}): ${await r.text()}`);
  }

  const data = await r.json();
  const videos = data.videos || [];
  if (videos.length === 0) {
    throw new Error(`No stock videos found on Pexels for "${query}"`);
  }

  const firstVid = videos[0];
  const files = firstVid.video_files || [];
  // Pick high quality HD/MP4 file
  const chosen = files.find((f: any) => f.quality === "hd" && f.file_type === "video/mp4") || files[0];
  if (!chosen?.link) {
    throw new Error("No playable MP4 video link found in Pexels response");
  }

  return chosen.link;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      prompt,
      image,
      provider = "auto",
      aspectRatio = "9:16",
      durationSeconds = 15,
      apiKey: customApiKey,
      productCategory,
      businessType,
    } = body;

    const dbCreds = await getUserCredentials(req);
    const effRunwayKey = (customApiKey?.runway || customApiKey || dbCreds.runwayKey || Deno.env.get("RUNWAY_API_KEY") || "").trim();
    const effPexelsKey = (customApiKey?.pexels || dbCreds.pexelsKey || Deno.env.get("PEXELS_API_KEY") || "").trim();
    const effGeminiKey = (customApiKey?.gemini || dbCreds.geminiKey || Deno.env.get("GOOGLE_API_KEY") || "").trim();

    const selectedProvider = provider.toLowerCase();

    // 1. Runway Gen-3
    if (selectedProvider === "runway" || (selectedProvider === "auto" && effRunwayKey)) {
      if (!effRunwayKey) {
        return json({
          error: "Runway API key is not configured. Please add your Runway key in API Setup to enable real AI video generation.",
          provider: "runway",
        }, 200);
      }

      try {
        console.log("Generating animated video with Runway Gen-3 Alpha...");
        const result = await generateWithRunway({
          apiKey: effRunwayKey,
          promptText: prompt || "Cinematic 360 degree commercial product rotation with dynamic studio lighting and camera tracking",
          imageUrl: image,
          durationSeconds,
          aspectRatio,
        });

        return json({
          success: true,
          videoUrl: result.videoUrl,
          provider: "runway",
          model: "gen3a_turbo",
          duration: result.duration,
          taskId: result.taskId,
        }, 200);
      } catch (runwayErr: any) {
        console.error("Runway generation failure:", runwayErr);
        if (selectedProvider === "runway") {
          return json({
            error: runwayErr.message || "Runway video generation failed",
            provider: "runway",
          }, 200);
        }
        // If auto, continue to Pexels fallback
      }
    }

    // 2. Google Veo Video Generation (if requested and Gemini key is provided)
    if (selectedProvider === "veo" && effGeminiKey) {
      try {
        console.log("Attempting Google Veo Video Generation via Gemini API...");
        const veoEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predictLongRunning?key=${effGeminiKey}`;
        const veoBody: Record<string, any> = {
          instances: [
            {
              prompt: prompt || "Commercial promotional video advertisement with cinematic camera motion and dynamic lighting",
            },
          ],
          parameters: {
            aspectRatio: aspectRatio === "9:16" ? "9:16" : "16:9",
            durationSeconds: durationSeconds >= 8 ? 8 : 5,
            sampleCount: 1,
          },
        };

        const veoRes = await fetch(veoEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(veoBody),
        });

        if (veoRes.ok) {
          const veoData = await veoRes.json();
          const opName = veoData.name;
          if (opName) {
            // Poll long running operation
            for (let i = 0; i < 40; i++) {
              await new Promise((r) => setTimeout(r, 3000));
              const opRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${opName}?key=${effGeminiKey}`);
              if (opRes.ok) {
                const opData = await opRes.json();
                if (opData.done) {
                  const generatedVideo = opData.response?.generatedSamples?.[0]?.video?.uri;
                  if (generatedVideo) {
                    return json({
                      success: true,
                      videoUrl: generatedVideo,
                      provider: "veo",
                      model: "veo-2.0-generate-001",
                    }, 200);
                  }
                  break;
                }
              }
            }
          }
        } else {
          const errText = await veoRes.text();
          console.warn("Google Veo initial request error:", errText);
        }
      } catch (veoErr) {
        console.warn("Google Veo generation exception:", veoErr);
      }
    }

    // 3. Pexels Stock Footage (Commercial video clip matching query)
    if (selectedProvider === "pexels" || (selectedProvider === "auto" && effPexelsKey)) {
      if (!effPexelsKey) {
        return json({
          error: "Pexels API key is not configured. Please add your key in API Setup.",
          provider: "pexels",
        }, 200);
      }

      try {
        const query = `${productCategory || businessType || "commercial retail"} commercial advertisement cinematic`;
        console.log(`Searching Pexels video footage for "${query}"...`);
        const pexelsUrl = await searchPexelsVideo({
          apiKey: effPexelsKey,
          query,
          aspectRatio,
        });

        return json({
          success: true,
          videoUrl: pexelsUrl,
          provider: "pexels",
        }, 200);
      } catch (pxErr: any) {
        return json({
          error: pxErr.message || "Failed to search Pexels commercial stock videos",
          provider: "pexels",
        }, 200);
      }
    }

    // No video provider configured
    return json({
      error: "No active video generation provider. Please configure Runway Gen-3 (AI Video) or Pexels API key in API Setup.",
      requiresApiKey: true,
    }, 200);
  } catch (e: any) {
    console.error("image-to-video function error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 200);
  }
});
