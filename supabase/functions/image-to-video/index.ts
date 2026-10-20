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

async function getUserNvidiaKey(req: Request): Promise<string> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error("Unauthorized");
  const { data } = await supabase
    .from("api_credentials")
    .select("nvidia_api_key")
    .eq("user_id", user.id)
    .single();
  const key = (data as any)?.nvidia_api_key;
  if (!key) throw new Error("NVIDIA_API_KEY not configured. Add it in API Setup.");
  return key;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = await getUserNvidiaKey(req);
    const { image, prompt = "", seed = 42 } = await req.json();
    if (!image || typeof image !== "string") {
      return json({ error: "image (data URL or public URL) required" }, 200);
    }

    // NVIDIA Cosmos Predict (Image2World) — deprecated endpoint
    return json(
      {
        error:
          "Video generation provider not configured. NVIDIA Cosmos image-to-video endpoint is deprecated and not publicly available. Use the animated promo video engine instead.",
      },
      200,
    );
  } catch (e) {
    console.error("image-to-video error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 200);
  }
});
