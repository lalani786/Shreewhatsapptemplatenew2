import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function youtubeDailyCap(): number {
  const n = parseInt(Deno.env.get("YOUTUBE_DAILY_CAP") || "6", 10);
  return Number.isFinite(n) && n > 0 ? n : 6;
}

function nextPacificMidnightUTC(): Date {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
  const pacificNow = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}:${parts.second}`);
  const offsetMs = now.getTime() - pacificNow.getTime();
  const local = new Date(pacificNow);
  local.setHours(24, 0, 0, 0);
  return new Date(local.getTime() + offsetMs);
}

async function countUploadsToday(supabase: any, userId: string): Promise<number> {
  const reset = nextPacificMidnightUTC();
  const windowStart = new Date(reset.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("social_media_posts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("platform", "youtube")
    .eq("status", "posted")
    .gte("posted_at", windowStart);
  return count || 0;
}

async function refreshYouTubeToken(refreshToken: string) {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return { error: "Google OAuth client not configured" };
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) return { error: data.error_description || data.error || `Refresh failed (${res.status})` };
  return { access_token: data.access_token as string };
}

function parseTitleAndDescription(content: string) {
  const trimmed = (content || "New video").trim();
  const firstLine = trimmed.split("\n")[0] || "New video";
  const title = (firstLine.length > 95 ? firstLine.slice(0, 95) + "…" : firstLine).slice(0, 100);
  return { title, description: trimmed };
}

async function uploadYouTubeVideo(accessToken: string, mediaUrl: string, content: string) {
  const videoRes = await fetch(mediaUrl);
  if (!videoRes.ok) return { error: `Failed to fetch video: HTTP ${videoRes.status}` };
  const contentType = videoRes.headers.get("content-type") || "video/*";
  const videoBytes = new Uint8Array(await videoRes.arrayBuffer());
  const { title, description } = parseTitleAndDescription(content);
  const metadata = {
    snippet: { title, description, categoryId: "22" },
    status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
  };
  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": contentType,
        "X-Upload-Content-Length": String(videoBytes.byteLength),
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!initRes.ok) {
    const errText = await initRes.text();
    if (initRes.status === 403 || /quota|rateLimitExceeded|RESOURCE_EXHAUSTED|video_insert/i.test(errText)) {
      return { error: "QUOTA_EXCEEDED", status: 429 };
    }
    return { error: `Upload init failed: ${errText}`, status: initRes.status };
  }
  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) return { error: "No upload URL returned from YouTube" };
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType, "Content-Length": String(videoBytes.byteLength) },
    body: videoBytes,
  });
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok) return { error: uploadData.error?.message || `Upload failed (${uploadRes.status})`, status: uploadRes.status };
  return { id: uploadData.id as string };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const nowIso = new Date().toISOString();
    const { data: due, error } = await supabase
      .from("social_media_posts")
      .select("id, user_id, content, media_url")
      .eq("platform", "youtube")
      .eq("status", "scheduled")
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(50);

    if (error) throw new Error(error.message);
    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cap = youtubeDailyCap();
    const perUserUsed = new Map<string, number>();
    const perUserToken = new Map<string, string>();
    const summary: any[] = [];

    for (const row of due) {
      let used = perUserUsed.get(row.user_id);
      if (used === undefined) {
        used = await countUploadsToday(supabase, row.user_id);
        perUserUsed.set(row.user_id, used);
      }

      if (used >= cap) {
        const nextReset = nextPacificMidnightUTC();
        await supabase.from("social_media_posts").update({
          scheduled_for: nextReset.toISOString(),
          error_message: `Daily cap (${cap}) still full. Re-scheduled for ${nextReset.toISOString()}.`,
        }).eq("id", row.id);
        summary.push({ id: row.id, rescheduled: true });
        continue;
      }

      if (!row.media_url) {
        await supabase.from("social_media_posts").update({
          status: "failed", error_message: "Missing media_url",
        }).eq("id", row.id);
        summary.push({ id: row.id, failed: "missing media" });
        continue;
      }

      // Get token (cached per user)
      let accessToken = perUserToken.get(row.user_id) || "";
      if (!accessToken) {
        const { data: creds } = await supabase
          .from("social_media_credentials")
          .select("youtube_access_token, youtube_refresh_token")
          .eq("user_id", row.user_id)
          .single();
        accessToken = creds?.youtube_access_token || "";
        if (!accessToken && creds?.youtube_refresh_token) {
          const r = await refreshYouTubeToken(creds.youtube_refresh_token);
          if (r.access_token) {
            accessToken = r.access_token;
            await supabase.from("social_media_credentials").upsert(
              { user_id: row.user_id, youtube_access_token: accessToken, updated_at: new Date().toISOString() },
              { onConflict: "user_id" },
            );
          }
        }
        if (!accessToken) {
          await supabase.from("social_media_posts").update({
            status: "failed", error_message: "YouTube not connected",
          }).eq("id", row.id);
          summary.push({ id: row.id, failed: "no token" });
          continue;
        }
        perUserToken.set(row.user_id, accessToken);
      }

      let result = await uploadYouTubeVideo(accessToken, row.media_url, row.content || "");

      // Refresh on 401
      if (result.error && (result.status === 401 || /invalid|expired|unauth/i.test(result.error))) {
        const { data: creds } = await supabase
          .from("social_media_credentials")
          .select("youtube_refresh_token")
          .eq("user_id", row.user_id)
          .single();
        if (creds?.youtube_refresh_token) {
          const r = await refreshYouTubeToken(creds.youtube_refresh_token);
          if (r.access_token) {
            accessToken = r.access_token;
            perUserToken.set(row.user_id, accessToken);
            await supabase.from("social_media_credentials").upsert(
              { user_id: row.user_id, youtube_access_token: accessToken, updated_at: new Date().toISOString() },
              { onConflict: "user_id" },
            );
            result = await uploadYouTubeVideo(accessToken, row.media_url, row.content || "");
          }
        }
      }

      if (result.error === "QUOTA_EXCEEDED" || result.status === 429) {
        const nextReset = nextPacificMidnightUTC();
        await supabase.from("social_media_posts").update({
          scheduled_for: nextReset.toISOString(),
          error_message: `YouTube quota hit on retry. Re-scheduled for ${nextReset.toISOString()}.`,
        }).eq("id", row.id);
        perUserUsed.set(row.user_id, cap);
        summary.push({ id: row.id, rescheduled: true });
        continue;
      }

      if (result.error || !result.id) {
        await supabase.from("social_media_posts").update({
          status: "failed", error_message: result.error || "Unknown YouTube upload error",
        }).eq("id", row.id);
        summary.push({ id: row.id, failed: result.error });
        continue;
      }

      await supabase.from("social_media_posts").update({
        status: "posted",
        platform_post_id: result.id,
        posted_at: new Date().toISOString(),
        error_message: null,
      }).eq("id", row.id);
      perUserUsed.set(row.user_id, used + 1);
      summary.push({ id: row.id, posted: result.id });
    }

    return new Response(JSON.stringify({ processed: due.length, summary }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-scheduled-youtube error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
