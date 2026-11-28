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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));

    // Priority 1: User-provided API key (for testing/override)
    let apiKey = (body?.apiKey as string | undefined)?.trim();

    // Priority 2: Retrieve user's API key from database using JWT authentication
    if (!apiKey) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return json({ ok: false, status: "missing", message: "Authorization header required" }, 401);
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return json({ ok: false, status: "invalid", message: "Invalid authentication" }, 401);
      }

      const { data: creds, error: dbError } = await supabase
        .from("api_credentials")
        .select("elevenlabs_api_key")
        .eq("user_id", user.id)
        .maybeSingle();

      if (dbError) {
        console.error("Database error fetching API key:", dbError);
        return json({ ok: false, status: "error", message: "Failed to retrieve API key from database" }, 500);
      }

      apiKey = (creds as any)?.elevenlabs_api_key?.trim() || "";
    }

    // Priority 3: Fallback to environment variable (for backward compatibility)
    if (!apiKey) {
      apiKey = Deno.env.get("ELEVENLABS_API_KEY")?.trim() || "";
    }

    if (!apiKey) {
      return json({ ok: false, status: "missing", message: "No API key configured. Please add your key in ElevenLabs Setup." });
    }

    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": apiKey },
    });

    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try {
        detail = JSON.parse(text)?.detail?.message || JSON.parse(text)?.detail?.status || text;
      } catch {}
      return json({
        ok: false,
        status: res.status === 401 ? "invalid" : "error",
        httpStatus: res.status,
        message: typeof detail === "string" ? detail : JSON.stringify(detail),
      });
    }

    const sub = JSON.parse(text);
    const used = sub.character_count ?? 0;
    const limit = sub.character_limit ?? 0;
    const remaining = Math.max(0, limit - used);

    return json({
      ok: true,
      status: "active",
      tier: sub.tier,
      characterCount: used,
      characterLimit: limit,
      charactersRemaining: remaining,
      nextResetUnix: sub.next_character_count_reset_unix,
    });
  } catch (e) {
    return json({ ok: false, status: "error", message: e instanceof Error ? e.message : String(e) });
  }
});
