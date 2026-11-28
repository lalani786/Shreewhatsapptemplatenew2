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
  userId?: string;
  runwayKey?: string;
  geminiKey?: string;
  pexelsKey?: string;
  leonardoKey?: string;
  nvidiaKey?: string;
  openaiKey?: string;
  openrouterKey?: string;
  pollinationsKey?: string;
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
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return {
      userId: user.id,
      runwayKey: (creds as any)?.runway_api_key?.trim() || undefined,
      geminiKey: (creds as any)?.gemini_api_key?.trim() || undefined,
      pexelsKey: (creds as any)?.pexels_api_key?.trim() || undefined,
      leonardoKey: (creds as any)?.leonardo_api_key?.trim() || undefined,
      nvidiaKey: (creds as any)?.nvidia_api_key?.trim() || undefined,
      openaiKey: (creds as any)?.openai_api_key?.trim() || undefined,
      openrouterKey: (creds as any)?.openrouter_api_key?.trim() || undefined,
      pollinationsKey: (creds as any)?.pollinations_api_key?.trim() || undefined,
    };
  } catch (err) {
    console.warn("Could not load credentials from DB:", err);
    return {};
  }
}

// -----------------------------------------------------------------------------
// Provider 1: Runway Gen-3 Alpha
// -----------------------------------------------------------------------------
async function generateWithRunway(options: {
  apiKey: string;
  promptText: string;
  imageUrl?: string;
  durationSeconds?: number;
  aspectRatio?: string;
}): Promise<{ videoUrl: string; taskId: string; duration: number }> {
  const { apiKey, promptText, imageUrl, durationSeconds = 5, aspectRatio = "9:16" } = options;
  const cleanKey = apiKey.replace(/^Bearer\s+/i, "").trim();

  const runwayRatio = aspectRatio === "9:16" ? "768:1280" : aspectRatio === "1:1" ? "1024:1024" : "1280:768";
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

// -----------------------------------------------------------------------------
// Provider 2: Google Veo (Veo 2.0 / Veo 3.1)
// -----------------------------------------------------------------------------
async function generateWithGoogleVeo(options: {
  apiKey: string;
  promptText: string;
  imageUrl?: string;
  durationSeconds?: number;
  aspectRatio?: string;
}): Promise<{ videoUrl: string; model: string }> {
  const { apiKey, promptText, imageUrl, durationSeconds = 5, aspectRatio = "9:16" } = options;
  const veoEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predictLongRunning?key=${apiKey}`;

  const instance: Record<string, any> = {
    prompt: promptText,
  };

  // If image is provided, pass reference
  if (imageUrl) {
    if (imageUrl.startsWith("data:")) {
      const parts = imageUrl.split(",");
      const mime = parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
      instance.image = {
        bytesBase64Encoded: parts[1],
        mimeType: mime,
      };
    } else {
      instance.image = {
        uri: imageUrl,
      };
    }
  }

  const veoBody = {
    instances: [instance],
    parameters: {
      aspectRatio: aspectRatio === "9:16" ? "9:16" : aspectRatio === "1:1" ? "1:1" : "16:9",
      durationSeconds: durationSeconds >= 8 ? 8 : 5,
      sampleCount: 1,
    },
  };

  const veoRes = await fetch(veoEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(veoBody),
  });

  if (!veoRes.ok) {
    const errText = await veoRes.text();
    let msg = errText;
    try {
      const j = JSON.parse(errText);
      msg = j.error?.message || j.message || errText;
    } catch {}
    if (
      msg.includes("not found for API version") ||
      msg.includes("not supported for predictLongRunning") ||
      veoRes.status === 404
    ) {
      msg = "Google Veo 2.0/3.1 requires Google Cloud Vertex AI allowlist access with a paid billing account. Standard Gemini AI Studio API keys do not currently have public access to Veo video generation. Please select Runway Gen-3 or the Built-in High-Speed MP4 Engine.";
    }
    throw new Error(`Google Veo error: ${msg}`);
  }

  const veoData = await veoRes.json();
  const opName = veoData.name;
  if (!opName) throw new Error("Google Veo did not return an operation name");

  console.log(`Google Veo operation started: ${opName}. Polling...`);

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const opRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${opName}?key=${apiKey}`);
    if (opRes.ok) {
      const opData = await opRes.json();
      if (opData.done) {
        if (opData.error) {
          throw new Error(`Google Veo failed: ${opData.error.message || "Unknown error"}`);
        }
        const generatedVideo = opData.response?.generatedSamples?.[0]?.video?.uri;
        if (generatedVideo) {
          return { videoUrl: generatedVideo, model: "veo-2.0-generate-001" };
        }
      }
    }
  }

  throw new Error("Google Veo operation timed out (120s). Please try again.");
}

// -----------------------------------------------------------------------------
// Provider 3: Leonardo AI Motion
// -----------------------------------------------------------------------------
async function generateWithLeonardoMotion(options: {
  apiKey: string;
  imageUrl: string;
  motionStrength?: number;
}): Promise<{ videoUrl: string; generationId: string }> {
  const { apiKey, imageUrl, motionStrength = 5 } = options;

  // Step 1: Upload or register image if needed, or pass directly
  // Leonardo Motion API: POST https://cloud.leonardo.ai/api/rest/v1/generations-motion-svd
  // First, if imageUrl is a public URL, we can upload it as an init image
  let imageId = "";
  try {
    const initRes = await fetch("https://cloud.leonardo.ai/api/rest/v1/init-image", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ extension: "png" }),
    });

    if (initRes.ok) {
      const initData = await initRes.json();
      const uploadUrl = initData?.uploadInitImage?.url;
      const id = initData?.uploadInitImage?.id;
      if (uploadUrl && id) {
        // Fetch source image and PUT to S3
        const srcRes = await fetch(imageUrl);
        const srcBlob = await srcRes.blob();
        await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": srcBlob.type || "image/png" },
          body: srcBlob,
        });
        imageId = id;
      }
    }
  } catch (err) {
    console.warn("Leonardo init-image upload fallback:", err);
  }

  const motionRes = await fetch("https://cloud.leonardo.ai/api/rest/v1/generations-motion-svd", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      imageId: imageId || imageUrl,
      motionStrength,
      isPublic: false,
    }),
  });

  if (!motionRes.ok) {
    const errText = await motionRes.text();
    throw new Error(`Leonardo AI Motion error: ${errText}`);
  }

  const motionData = await motionRes.json();
  const generationId = motionData?.motionSvdGenerationJob?.generationId;
  if (!generationId) throw new Error("Leonardo did not return a generationId");

  console.log(`Leonardo Motion job started: ${generationId}. Polling...`);

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const checkRes = await fetch(`https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      const job = checkData?.generations_by_pk;
      if (job?.status === "COMPLETE") {
        const videoUrl = job?.generated_images?.[0]?.motionMP4URL;
        if (videoUrl) {
          return { videoUrl, generationId };
        }
      } else if (job?.status === "FAILED") {
        throw new Error("Leonardo Motion video generation failed.");
      }
    }
  }

  throw new Error("Leonardo Motion generation timed out.");
}

// -----------------------------------------------------------------------------
// Provider 4: OpenAI Sora (Preview / Video API)
// -----------------------------------------------------------------------------
async function generateWithOpenAISora(options: {
  apiKey: string;
  promptText: string;
  imageUrl?: string;
  durationSeconds?: number;
}): Promise<{ videoUrl: string }> {
  const { apiKey, promptText, imageUrl, durationSeconds = 5 } = options;
  const res = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sora-1.0",
      prompt: promptText,
      input_image: imageUrl,
      duration: durationSeconds,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI Sora API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const videoUrl = data?.data?.[0]?.url || data?.video_url;
  if (!videoUrl) throw new Error("OpenAI Sora did not return a video URL");
  return { videoUrl };
}

// -----------------------------------------------------------------------------
// Provider 5: NVIDIA NIM Video (Cosmos / Diffusion)
// -----------------------------------------------------------------------------
async function generateWithNvidiaCosmos(options: {
  apiKey: string;
  promptText: string;
  imageUrl?: string;
}): Promise<{ videoUrl: string }> {
  const { apiKey, promptText, imageUrl } = options;
  const customCosmosEndpoint = Deno.env.get("NVIDIA_COSMOS_ENDPOINT");

  if (!customCosmosEndpoint) {
    throw new Error(
      "NVIDIA Cosmos is distributed as a self-hosted Docker container (NIM) for dedicated GPU servers and is not hosted as a public cloud API on integrate.api.nvidia.com. Please select Runway Gen-3 or the Built-in High-Speed MP4 Engine for instant commercial video generation."
    );
  }

  const res = await fetch(customCosmosEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "nvidia/cosmos-nemotron-34b",
      prompt: promptText,
      image: imageUrl,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`NVIDIA Cosmos error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const videoUrl = data?.video_url || data?.data?.[0]?.url;
  if (!videoUrl) throw new Error("NVIDIA Cosmos did not return a video URL");
  return { videoUrl };
}

// -----------------------------------------------------------------------------
// Provider 6: Pexels Stock Footage
// -----------------------------------------------------------------------------
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
  const chosen = files.find((f: any) => f.quality === "hd" && f.file_type === "video/mp4") || files[0];
  if (!chosen?.link) {
    throw new Error("No playable MP4 video link found in Pexels response");
  }

  return chosen.link;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      prompt,
      image,
      provider = "auto",
      aspectRatio = "9:16",
      durationSeconds = 5,
      motionStyle = "Cinematic",
      cameraMovement = "Zoom In",
      apiKey: customApiKey,
      productCategory,
      businessType,
      companyId,
    } = body;

    const dbCreds = await getUserCredentials(req);
    const effRunwayKey = (customApiKey?.runway || customApiKey || dbCreds.runwayKey || Deno.env.get("RUNWAY_API_KEY") || "").trim();
    const effPexelsKey = (customApiKey?.pexels || dbCreds.pexelsKey || Deno.env.get("PEXELS_API_KEY") || "").trim();
    const effGeminiKey = (customApiKey?.gemini || dbCreds.geminiKey || Deno.env.get("GOOGLE_API_KEY") || "").trim();
    const effLeonardoKey = (customApiKey?.leonardo || dbCreds.leonardoKey || Deno.env.get("LEONARDO_API_KEY") || "").trim();
    const effNvidiaKey = (customApiKey?.nvidia || dbCreds.nvidiaKey || Deno.env.get("NVIDIA_API_KEY") || "").trim();
    const effOpenaiKey = (customApiKey?.openai || dbCreds.openaiKey || Deno.env.get("OPENAI_API_KEY") || "").trim();

    const selectedProvider = (provider || "auto").toLowerCase();
    const motionPrompt = `${prompt || "Commercial product video advertisement"}. Motion style: ${motionStyle}. Camera: ${cameraMovement}.`;

    // 1. Google Veo
    if (selectedProvider === "veo" || (selectedProvider === "auto" && effGeminiKey && !effRunwayKey)) {
      if (!effGeminiKey) {
        if (selectedProvider === "veo") {
          return json({ error: "Google Veo requires GEMINI_API_KEY. Add it in API Setup.", provider: "veo" }, 200);
        }
      } else {
        try {
          console.log("Generating video with Google Veo...");
          const res = await generateWithGoogleVeo({
            apiKey: effGeminiKey,
            promptText: motionPrompt,
            imageUrl: image,
            durationSeconds,
            aspectRatio,
          });
          return json({
            success: true,
            videoUrl: res.videoUrl,
            provider: "veo",
            model: res.model,
            duration: durationSeconds,
            motionStyle,
            cameraMovement,
          }, 200);
        } catch (veoErr: any) {
          console.warn("Google Veo error:", veoErr);
          if (selectedProvider === "veo") {
            return json({ error: veoErr.message || "Google Veo generation failed", provider: "veo" }, 200);
          }
        }
      }
    }

    // 2. Runway Gen-3 Alpha
    if (selectedProvider === "runway" || (selectedProvider === "auto" && effRunwayKey)) {
      if (!effRunwayKey) {
        if (selectedProvider === "runway") {
          return json({ error: "Runway API key is not configured. Add your Runway key in API Setup.", provider: "runway" }, 200);
        }
      } else {
        try {
          console.log("Generating video with Runway Gen-3 Alpha...");
          const result = await generateWithRunway({
            apiKey: effRunwayKey,
            promptText: motionPrompt,
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
            motionStyle,
            cameraMovement,
          }, 200);
        } catch (runwayErr: any) {
          console.warn("Runway error:", runwayErr);
          if (selectedProvider === "runway") {
            return json({ error: runwayErr.message || "Runway video generation failed", provider: "runway" }, 200);
          }
        }
      }
    }

    // 3. Leonardo AI Motion
    if (selectedProvider === "leonardo" || (selectedProvider === "auto" && effLeonardoKey)) {
      if (!effLeonardoKey) {
        if (selectedProvider === "leonardo") {
          return json({ error: "Leonardo API key is not configured. Add your Leonardo key in API Setup.", provider: "leonardo" }, 200);
        }
      } else {
        try {
          console.log("Generating video with Leonardo AI Motion...");
          const res = await generateWithLeonardoMotion({
            apiKey: effLeonardoKey,
            imageUrl: image,
            motionStrength: motionStyle === "Slow Motion" ? 2 : motionStyle === "3D Motion" ? 8 : 5,
          });
          return json({
            success: true,
            videoUrl: res.videoUrl,
            provider: "leonardo",
            model: "motion-svd",
            duration: durationSeconds,
            motionStyle,
            cameraMovement,
          }, 200);
        } catch (leoErr: any) {
          console.warn("Leonardo Motion error:", leoErr);
          if (selectedProvider === "leonardo") {
            return json({ error: leoErr.message || "Leonardo Motion generation failed", provider: "leonardo" }, 200);
          }
        }
      }
    }

    // 4. OpenAI Sora
    if (selectedProvider === "sora" || selectedProvider === "openai") {
      if (!effOpenaiKey) {
        return json({ error: "OpenAI API key not configured for Sora video generation.", provider: "sora" }, 200);
      }
      try {
        console.log("Generating video with OpenAI Sora...");
        const res = await generateWithOpenAISora({
          apiKey: effOpenaiKey,
          promptText: motionPrompt,
          imageUrl: image,
          durationSeconds,
        });
        return json({
          success: true,
          videoUrl: res.videoUrl,
          provider: "sora",
          model: "sora-1.0",
          duration: durationSeconds,
          motionStyle,
          cameraMovement,
        }, 200);
      } catch (soraErr: any) {
        return json({ error: soraErr.message || "OpenAI Sora generation failed", provider: "sora" }, 200);
      }
    }

    // 5. NVIDIA NIM Cosmos
    if (selectedProvider === "nvidia" || selectedProvider === "cosmos") {
      if (!effNvidiaKey) {
        return json({ error: "NVIDIA API key not configured. Add your NVIDIA key in API Setup.", provider: "nvidia" }, 200);
      }
      try {
        console.log("Generating video with NVIDIA Cosmos...");
        const res = await generateWithNvidiaCosmos({
          apiKey: effNvidiaKey,
          promptText: motionPrompt,
          imageUrl: image,
        });
        return json({
          success: true,
          videoUrl: res.videoUrl,
          provider: "nvidia",
          model: "cosmos-nemotron-34b",
          duration: durationSeconds,
          motionStyle,
          cameraMovement,
        }, 200);
      } catch (nvErr: any) {
        return json({ error: nvErr.message || "NVIDIA Cosmos generation failed", provider: "nvidia" }, 200);
      }
    }

    // 6. Pexels Stock Video
    if (selectedProvider === "pexels" || (selectedProvider === "auto" && effPexelsKey)) {
      if (!effPexelsKey) {
        if (selectedProvider === "pexels") {
          return json({ error: "Pexels API key not configured. Add your key in API Setup.", provider: "pexels" }, 200);
        }
      } else {
        try {
          const query = `${productCategory || businessType || "commercial retail"} ${motionStyle} advertisement`;
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
            duration: durationSeconds,
            motionStyle,
            cameraMovement,
          }, 200);
        } catch (pxErr: any) {
          if (selectedProvider === "pexels") {
            return json({ error: pxErr.message || "Failed to search Pexels commercial stock videos", provider: "pexels" }, 200);
          }
        }
      }
    }

    // If auto and no external key is active, instruct client to use built-in MP4 engine
    return json({
      success: false,
      useClientEngine: true,
      provider: selectedProvider,
      message: "No cloud video provider configured with active credits. Use Built-in High-Speed MP4 Engine for instant animated video.",
    }, 200);
  } catch (e: any) {
    console.error("image-to-video function error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 200);
  }
});
