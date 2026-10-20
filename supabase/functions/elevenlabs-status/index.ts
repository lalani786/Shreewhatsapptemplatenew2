import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const apiKey = (body?.apiKey as string | undefined)?.trim() || Deno.env.get("ELEVENLABS_API_KEY");

    if (!apiKey) {
      return json({ ok: false, status: "missing", message: "No API key configured" });
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
