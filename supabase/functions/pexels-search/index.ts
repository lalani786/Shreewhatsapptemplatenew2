import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Please sign in first." });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Please sign in first." });

    const body = await req.json().catch(() => ({}));
    const rawQuery = String(body.query || "").trim().slice(0, 200);
    const kind = body.kind === "photo" ? "photo" : "video";
    if (!rawQuery) return json({ error: "Please enter a prompt." });

    const { data: cred } = await supabase.from("api_credentials").select("pexels_api_key").eq("user_id", user.id).maybeSingle();
    const key = (cred as any)?.pexels_api_key || Deno.env.get("PEXELS_API_KEY");
    if (!key) return json({ error: "Add your Pexels API key in API Setup first." });

    // Clean conversational phrases from natural language prompts
    const stopWords = new Set([
      "create", "a", "an", "the", "video", "videos", "promo", "promotional", "for", "our", "my",
      "showing", "about", "with", "make", "generate", "please", "ad", "advertisement", "marketing",
      "social", "media", "post", "reel", "story", "clip", "short", "footage", "stock", "high",
      "quality", "best", "and", "or", "in", "on", "at", "to", "of", "is", "are", "background",
      "animation", "realistic", "4k", "hd", "problem", "prompt", "original"
    ]);

    const cleanTokens = rawQuery
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    // Try search queries in order of specificity
    const candidateQueries = [
      cleanTokens.slice(0, 3).join(" "),
      cleanTokens.slice(0, 2).join(" "),
      cleanTokens[0] || "",
      rawQuery.split(/\s+/).slice(0, 4).join(" "),
    ].filter((q) => q.trim().length > 0);

    // Dedup
    const queryList = Array.from(new Set(candidateQueries));

    let searchData: any = null;
    let successfulQuery = "";

    for (const q of queryList) {
      const endpoint = kind === "video"
        ? `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=15`
        : `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=15`;

      const res = await fetch(endpoint, { headers: { Authorization: key } });
      if (!res.ok) {
        const t = await res.text();
        return json({
          error: res.status === 401 || res.status === 403
            ? "Pexels API key is invalid."
            : `Pexels error ${res.status}: ${t.slice(0, 200)}`,
        });
      }
      const parsed = await res.json();
      const items = kind === "video" ? parsed.videos : parsed.photos;
      if (items && items.length > 0) {
        searchData = parsed;
        successfulQuery = q;
        break;
      }
    }

    if (!searchData) {
      return json({ error: `No Pexels ${kind}s found matching "${rawQuery}". Try simpler keywords.` });
    }

    if (kind === "video") {
      const videos = searchData.videos || [];
      if (!videos.length) return json({ error: `No Pexels videos found for "${rawQuery}". Try simpler keywords.` });
      // Choose the top relevance match
      const v = videos[0];
      const files = (v.video_files || []).filter((f: any) => f.file_type === "video/mp4");
      files.sort((a: any, b: any) => Math.abs((a.width || 0) - 1080) - Math.abs((b.width || 0) - 1080));
      const file = files.find((f: any) => (f.width || 0) <= 1920) || files[0];
      if (!file) return json({ error: "No MP4 file available for this Pexels video." });
      return json({
        videoUrl: file.link,
        thumbnail: v.image,
        credit: v.user?.name,
        pageUrl: v.url,
        matchedQuery: successfulQuery,
      });
    }

    const photos = searchData.photos || [];
    if (!photos.length) return json({ error: `No Pexels photos found for "${rawQuery}". Try simpler keywords.` });
    const p = photos[0];
    return json({
      imageUrl: p.src?.large2x || p.src?.large || p.src?.original,
      credit: p.photographer,
      pageUrl: p.url,
      matchedQuery: successfulQuery,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Pexels request failed" });
  }
});
