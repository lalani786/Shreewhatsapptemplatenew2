import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PostResult {
  platform: string;
  success: boolean;
  error?: string;
  postId?: string;
}

function isDataUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith("data:");
}

function isHttpUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

async function uploadDataUrlToStorage(supabase: any, dataUrl: string, userId: string): Promise<string> {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid generated image format");
  }

  const mimeType = matches[1];
  const base64Content = matches[2];
  const binaryString = atob(base64Content);
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  const extension = mimeType.split("/")[1] || "png";
  const fileName = `${userId}/social/${Date.now()}_${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage
    .from("whatsapp-media")
    .upload(fileName, bytes, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload generated image: ${error.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from("whatsapp-media")
    .getPublicUrl(data.path);

  return publicUrlData.publicUrl;
}

async function normalizeMediaUrl(supabase: any, mediaUrl: string | null, userId: string): Promise<string | null> {
  if (!mediaUrl) return null;
  if (isHttpUrl(mediaUrl)) return mediaUrl;
  if (isDataUrl(mediaUrl)) {
    return await uploadDataUrlToStorage(supabase, mediaUrl, userId);
  }

  throw new Error("Media must be a public image URL or generated image data");
}

function getInstagramToken(credentials: any): string | null {
  return credentials.instagram_access_token || credentials.facebook_page_access_token || null;
}

function isVideoUrl(url: string | null): boolean {
  if (!url) return false;
  return /\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(url);
}

async function postToFacebook(content: string, mediaUrl: string | null, credentials: any): Promise<PostResult> {
  try {
    let pageId = String(credentials.facebook_page_id || "").trim();
    let pageToken = String(credentials.facebook_page_access_token || "").trim();
    if (!pageId || !pageToken) {
      return { platform: "facebook", success: false, error: "Facebook credentials not configured" };
    }

    // Auto-verify and upgrade token/ID if user provided a User Token or Personal Profile ID
    try {
      const inspectRes = await fetch(
        `https://graph.facebook.com/v18.0/${encodeURIComponent(pageId)}?fields=id,name,category,access_token&access_token=${encodeURIComponent(pageToken)}`
      );
      const inspectData = await inspectRes.json();

      if (inspectRes.ok) {
        // If node returns access_token, pageToken was a User Token managing this Page. Seamlessly upgrade to Page Access Token!
        if (inspectData.access_token) {
          pageToken = String(inspectData.access_token).trim();
        }

        // If node has no category, pageId is a personal User Profile, NOT a Page!
        if (!inspectData.category) {
          const accountsRes = await fetch(
            `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,category,access_token&access_token=${encodeURIComponent(pageToken)}`
          );
          const accountsData = await accountsRes.json();
          if (accountsRes.ok && Array.isArray(accountsData.data) && accountsData.data.length > 0) {
            pageId = String(accountsData.data[0].id).trim();
            pageToken = String(accountsData.data[0].access_token || pageToken).trim();
            console.log(`Auto-corrected personal profile ID to managed Page: ${accountsData.data[0].name} (${pageId})`);
          } else {
            return {
              platform: "facebook",
              success: false,
              error: `Facebook Error (#200): The ID "${pageId}" is a personal Facebook profile (${inspectData.name}), NOT a Facebook Page. Meta has permanently deprecated 'publish_actions' and prohibits posting to personal user profiles. Please configure a Facebook PAGE ID and Page Access Token in Social Media -> Connect Platforms.`,
            };
          }
        }
      }
    } catch (inspectErr) {
      console.warn("Facebook pre-inspection non-blocking error:", inspectErr);
    }

    let url: string;
    let body: any;

    if (mediaUrl && isVideoUrl(mediaUrl)) {
      url = `https://graph-video.facebook.com/v18.0/${pageId}/videos`;
      body = { file_url: mediaUrl, description: content, access_token: pageToken };
    } else if (mediaUrl) {
      url = `https://graph.facebook.com/v18.0/${pageId}/photos`;
      body = { url: mediaUrl, caption: content, access_token: pageToken };
    } else {
      url = `https://graph.facebook.com/v18.0/${pageId}/feed`;
      body = { message: content, access_token: pageToken };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      const errMsg = data.error?.message || `HTTP ${response.status}`;
      if (errMsg.toLowerCase().includes("publish_actions")) {
        return {
          platform: "facebook",
          success: false,
          error: "Facebook Error (#200): 'publish_actions' is deprecated. Facebook has permanently prohibited automated posting to personal user profiles. Please ensure you entered your Facebook PAGE ID (not your personal user profile ID) and a Page Access Token.",
        };
      }
      if (
        errMsg.toLowerCase().includes("permissions error") ||
        data.error?.code === 200
      ) {
        return {
          platform: "facebook",
          success: false,
          error: "Facebook Error (#200 Permissions error): The token lacks posting permission on this Page. Fix: In Meta Graph API Explorer, grant 'pages_manage_posts' and 'pages_read_engagement' permissions, regenerate the Page Token, and verify your account has 'Content' access on the Facebook Page.",
        };
      }
      if (
        errMsg.toLowerCase().includes("no permission to publish the video") ||
        (data.error?.code === 100 && isVideoUrl(mediaUrl || ""))
      ) {
        return {
          platform: "facebook",
          success: false,
          error: "Facebook Video Error (#100): No permission to publish the video. Fix: Ensure you configured a Page Access Token (not a User Token) with 'pages_manage_posts' and 'publish_video' permissions, and that your account is an Admin/Content Creator on the Page.",
        };
      }
      return { platform: "facebook", success: false, error: errMsg };
    }
    return { platform: "facebook", success: true, postId: data.id || data.post_id };
  } catch (err) {
    return { platform: "facebook", success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

async function postToInstagram(content: string, mediaUrl: string | null, credentials: any): Promise<PostResult> {
  try {
    const instagramAccountId = credentials.instagram_business_account_id;
    const accessToken = getInstagramToken(credentials);
    if (!instagramAccountId || !accessToken) {
      return { platform: "instagram", success: false, error: "Instagram credentials not configured. Set Instagram Node ID and Access Token." };
    }

    if (!mediaUrl) {
      return { platform: "instagram", success: false, error: "Instagram requires media (image or video) for posts" };
    }

    if (!isHttpUrl(mediaUrl)) {
      return { platform: "instagram", success: false, error: "Instagram requires a public media URL" };
    }

    // Pre-flight: verify Instagram's servers can fetch the media URL anonymously.
    // IG returns a generic "Authorization Error" during container polling when the
    // URL is private, requires a signed token, redirects, or returns non-200.
    try {
      let probe = await fetch(mediaUrl, { method: "HEAD", redirect: "follow" });
      if (!probe.ok || probe.status === 405) {
        // Some CDNs (incl. Supabase Storage) don't support HEAD — retry with ranged GET
        probe = await fetch(mediaUrl, { method: "GET", headers: { Range: "bytes=0-1023" }, redirect: "follow" });
      }
      if (!probe.ok) {
        return {
          platform: "instagram",
          success: false,
          error: `Instagram cannot fetch your media URL (HTTP ${probe.status}). The file must be PUBLIC and reachable without authentication. If using Supabase Storage, make sure the bucket is public and you're passing the public URL (no signed token).`,
        };
      }
      const ct = probe.headers.get("content-type") || "";
      if (isVideoUrl(mediaUrl) && ct && !/video\//i.test(ct)) {
        console.warn(`Media URL content-type "${ct}" doesn't look like a video. IG may reject.`);
      }
    } catch (probeErr) {
      return {
        platform: "instagram",
        success: false,
        error: `Could not reach media URL: ${probeErr instanceof Error ? probeErr.message : "network error"}. Instagram requires a publicly accessible URL.`,
      };
    }

    const isVideo = isVideoUrl(mediaUrl);

    if (isVideo && mediaUrl.toLowerCase().includes(".webm")) {
      return {
        platform: "instagram",
        success: false,
        error: "Instagram Graph API only accepts MP4 / MOV video files for Reels. WebM is not supported by Instagram. Please generate or upload an MP4 video.",
      };
    }

    // Step 1: Create media container
    const containerBody: any = {
      caption: content,
      access_token: accessToken,
    };

    if (isVideo) {
      containerBody.media_type = "REELS";
      containerBody.video_url = mediaUrl;
    } else {
      containerBody.image_url = mediaUrl;
    }

    const createResponse = await fetch(
      `https://graph.facebook.com/v18.0/${instagramAccountId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(containerBody),
      }
    );

    const createData = await createResponse.json();
    if (!createResponse.ok) {
      return { platform: "instagram", success: false, error: createData.error?.message || `HTTP ${createResponse.status}` };
    }

    // Poll until container is ready. Videos can take 1-3 min on IG, especially Reels.
    const maxAttempts = isVideo ? 36 : 10;   // video: 36 * 5s = 3 min ; image: 10 * 3s = 30s
    const pollInterval = isVideo ? 5000 : 3000;
    let ready = false;
    let lastStatus: any = null;
    let lastError: string | null = null;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, pollInterval));
      const statusRes = await fetch(
        `https://graph.facebook.com/v18.0/${createData.id}?fields=status_code,status&access_token=${accessToken}`
      );
      const statusData = await statusRes.json();
      lastStatus = statusData;
      console.log(`Instagram container status (attempt ${i + 1}):`, JSON.stringify(statusData));

      // Surface API errors immediately (bad token, removed media, etc.)
      if (statusData.error) {
        lastError = statusData.error.message || JSON.stringify(statusData.error);
        const isAuth = /authorization/i.test(lastError);
        const hint = isAuth
          ? ' — Instagram could not download your media URL. Make sure it is PUBLIC (no signed token, no auth), returns HTTP 200, and serves the correct content-type (video/mp4 for Reels, image/jpeg for photos). For Reels: MP4/MOV, ≤90s, ≤100MB, aspect 9:16 recommended.'
          : '';
        return { platform: "instagram", success: false, error: `Instagram container error: ${lastError}${hint}` };
      }

      const code = statusData.status_code;
      // status is a human-readable string like "In progress: ..." or "Error: ..."
      const statusText: string = statusData.status || "";
      if (code === "FINISHED") { ready = true; break; }
      if (code === "ERROR" || code === "EXPIRED") {
        return { platform: "instagram", success: false, error: `Instagram media processing failed (${code})${statusText ? `: ${statusText}` : ""}. Ensure the media URL is publicly reachable and meets IG specs (Reels: MP4/MOV, ≤90s, ≤100MB, 9:16).` };
      }
      // IN_PROGRESS / PUBLISHED / undefined => keep polling
    }
    if (!ready) {
      return {
        platform: "instagram",
        success: false,
        error: `Instagram media processing timed out after ${(maxAttempts * pollInterval) / 1000}s. Last status: ${JSON.stringify(lastStatus)}. Check that the media URL is publicly reachable and the video meets IG Reels specs (MP4/MOV, ≤90s, ≤100MB, aspect 9:16 recommended).`,
      };
    }

    // Step 2: Publish — IG often returns a transient "Fatal" or network connection reset
    // right after FINISHED. Retry with backoff before giving up.
    let publishData: any = null;
    let lastPubErr: any = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      if (attempt > 1) await new Promise(r => setTimeout(r, 3000 * attempt));
      try {
        const publishResponse = await fetch(
          `https://graph.facebook.com/v18.0/${instagramAccountId}/media_publish`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ creation_id: createData.id, access_token: accessToken }),
          }
        );
        publishData = await publishResponse.json().catch(() => ({}));
        console.log(`Instagram publish attempt ${attempt}:`, publishResponse.status, JSON.stringify(publishData));
        if (publishResponse.ok && publishData.id) {
          return { platform: "instagram", success: true, postId: publishData.id };
        }
        lastPubErr = publishData.error || { message: `HTTP ${publishResponse.status}` };
        const transient =
          lastPubErr.is_transient ||
          [1, 2, 4, 9007, -1].includes(lastPubErr.code) ||
          /fatal|unexpected|try again|not ready|connection/i.test(
            `${lastPubErr.message} ${lastPubErr.error_user_msg || ""}`
          );
        if (!transient) break;
      } catch (networkErr: any) {
        console.warn(`Instagram publish attempt ${attempt} network error:`, networkErr?.message || networkErr);
        lastPubErr = { message: networkErr?.message || "Connection reset" };
        // Wait and let retry loop try next attempt
      }
    }

    // Pre-check if container ended up published despite connection hiccup
    try {
      const checkRes = await fetch(
        `https://graph.facebook.com/v18.0/${createData.id}?fields=status_code,status&access_token=${accessToken}`
      );
      const checkData = await checkRes.json();
      if (checkData.status_code === "PUBLISHED" || checkData.status_code === "FINISHED") {
        return { platform: "instagram", success: true, postId: createData.id };
      }
    } catch (_) {}

    const details = [lastPubErr?.error_user_title, lastPubErr?.error_user_msg].filter(Boolean).join(": ");
    return {
      platform: "instagram",
      success: false,
      error: `Instagram publish failed: ${lastPubErr?.message || "Unknown"}${details ? ` (${details})` : ""}${lastPubErr?.code ? ` [code ${lastPubErr.code}${lastPubErr.error_subcode ? `/${lastPubErr.error_subcode}` : ""}]` : ""}. Please try clicking Post again in a few seconds.`,
    };
  } catch (err) {
    return { platform: "instagram", success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

async function postToX(content: string, mediaUrl: string | null, credentials: any): Promise<PostResult> {
  try {
    const { x_bearer_token } = credentials;
    if (!x_bearer_token) {
      return { platform: "x", success: false, error: "X (Twitter) bearer token not configured" };
    }

    const tweetBody: any = { text: content };

    const response = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${x_bearer_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tweetBody),
    });

    const data = await response.json();
    if (!response.ok) {
      return { platform: "x", success: false, error: data.detail || data.title || `HTTP ${response.status}` };
    }
    return { platform: "x", success: true, postId: data.data?.id };
  } catch (err) {
    return { platform: "x", success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

async function postToTelegram(content: string, mediaUrl: string | null, credentials: any): Promise<PostResult> {
  try {
    const { telegram_bot_token, telegram_channel_id } = credentials;
    if (!telegram_bot_token || !telegram_channel_id) {
      return { platform: "telegram", success: false, error: "Telegram credentials not configured" };
    }

    let url: string;
    let body: any;

    if (mediaUrl && isVideoUrl(mediaUrl)) {
      url = `https://api.telegram.org/bot${telegram_bot_token}/sendVideo`;
      body = { chat_id: telegram_channel_id, video: mediaUrl, caption: content };
    } else if (mediaUrl) {
      url = `https://api.telegram.org/bot${telegram_bot_token}/sendPhoto`;
      body = { chat_id: telegram_channel_id, photo: mediaUrl, caption: content };
    } else {
      url = `https://api.telegram.org/bot${telegram_bot_token}/sendMessage`;
      body = { chat_id: telegram_channel_id, text: content };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!data.ok) {
      return { platform: "telegram", success: false, error: data.description || "Telegram API error" };
    }
    return { platform: "telegram", success: true, postId: String(data.result?.message_id) };
  } catch (err) {
    return { platform: "telegram", success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

async function refreshYouTubeToken(refreshToken: string): Promise<{ access_token?: string; error?: string }> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return { error: "Google OAuth client not configured" };

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    return { error: data.error_description || data.error || `Refresh failed (${res.status})` };
  }
  return { access_token: data.access_token };
}

function parseTitleAndDescription(content: string): { title: string; description: string } {
  const trimmed = content.trim();
  const firstLine = trimmed.split("\n")[0] || "New video";
  const title = (firstLine.length > 95 ? firstLine.slice(0, 95) + "…" : firstLine).slice(0, 100);
  return { title, description: trimmed };
}

async function uploadYouTubeVideo(accessToken: string, mediaUrl: string, content: string): Promise<{ id?: string; error?: string; status?: number }> {
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
    // Detect YouTube daily upload quota exhaustion (default 6/day for unaudited projects)
    if (
      initRes.status === 403 ||
      /quota|rateLimitExceeded|RESOURCE_EXHAUSTED|video_insert/i.test(errText)
    ) {
      return {
        error:
          "YouTube daily upload quota exceeded (default limit is 6 videos/day). Wait ~24h for reset, or request a quota increase from Google: https://support.google.com/youtube/contact/yt_api_form",
        status: 429,
      };
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
  if (!uploadRes.ok) {
    return { error: uploadData.error?.message || `Upload failed (${uploadRes.status})`, status: uploadRes.status };
  }
  return { id: uploadData.id };
}

// YouTube daily upload cap (default Google free quota = 6 uploads/day).
// Override with YOUTUBE_DAILY_CAP secret if your project has a higher audited quota.
function youtubeDailyCap(): number {
  const n = parseInt(Deno.env.get("YOUTUBE_DAILY_CAP") || "6", 10);
  return Number.isFinite(n) && n > 0 ? n : 6;
}

// YouTube quota resets at midnight Pacific Time. Compute the next reset in UTC.
function nextPacificMidnightUTC(): Date {
  const now = new Date();
  // Get current Pacific wall-clock parts
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
  const pacificNow = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}:${parts.second}`);
  // Offset between UTC and Pacific at this instant (ms)
  const offsetMs = now.getTime() - pacificNow.getTime();
  // Next Pacific midnight = (Pacific date + 1 day) at 00:00, converted back to UTC
  const nextPacificMidnightLocal = new Date(pacificNow);
  nextPacificMidnightLocal.setHours(24, 0, 0, 0);
  return new Date(nextPacificMidnightLocal.getTime() + offsetMs);
}

async function countYouTubeUploadsToday(supabase: any, userId: string): Promise<number> {
  const reset = nextPacificMidnightUTC();
  const windowStart = new Date(reset.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("social_media_posts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("platform", "youtube")
    .eq("status", "posted")
    .gte("posted_at", windowStart);
  if (error) {
    console.warn("countYouTubeUploadsToday error:", error.message);
    return 0;
  }
  return count || 0;
}

async function scheduleYouTubePost(supabase: any, userId: string, scheduledFor: Date, reason: string): Promise<boolean> {
  const { error } = await supabase
    .from("social_media_posts")
    .update({
      status: "scheduled",
      scheduled_for: scheduledFor.toISOString(),
      error_message: reason,
    })
    .eq("user_id", userId)
    .eq("platform", "youtube")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.warn("scheduleYouTubePost error:", error.message);
    return false;
  }
  return true;
}

async function postToYouTube(content: string, mediaUrl: string | null, credentials: any, supabase: any, userId: string): Promise<PostResult> {
  try {
    if (!mediaUrl) {
      return { platform: "youtube", success: false, error: "YouTube requires a video file to upload" };
    }
    if (!isVideoUrl(mediaUrl)) {
      return { platform: "youtube", success: false, error: "YouTube only supports video uploads (mp4, mov, webm, etc.)" };
    }

    // ---- Daily cap guard (prevents 403 quotaExceeded from YouTube API) ----
    const cap = youtubeDailyCap();
    const used = await countYouTubeUploadsToday(supabase, userId);
    if (used >= cap) {
      const nextReset = nextPacificMidnightUTC();
      const reason = `Daily YouTube cap reached (${used}/${cap}). Scheduled to retry after ${nextReset.toISOString()} (next Pacific-midnight reset).`;
      await scheduleYouTubePost(supabase, userId, nextReset, reason);
      return { platform: "youtube", success: false, error: reason };
    }

    let accessToken: string | null = credentials.youtube_access_token || null;
    const refreshToken: string | null = credentials.youtube_refresh_token || null;

    if (!accessToken && !refreshToken) {
      return { platform: "youtube", success: false, error: "YouTube not connected. Click 'Reconnect YouTube' to authorize." };
    }

    let result = accessToken
      ? await uploadYouTubeVideo(accessToken, mediaUrl, content)
      : { error: "no token", status: 401 };

    // If unauthorized, try refresh
    if (result.error && (result.status === 401 || /invalid|expired|unauth/i.test(result.error)) && refreshToken) {
      const refreshed = await refreshYouTubeToken(refreshToken);
      if (refreshed.error || !refreshed.access_token) {
        return { platform: "youtube", success: false, error: `Token refresh failed: ${refreshed.error}. Reconnect YouTube.` };
      }
      accessToken = refreshed.access_token;
      await supabase
        .from("social_media_credentials")
        .upsert({ user_id: userId, youtube_access_token: accessToken, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      result = await uploadYouTubeVideo(accessToken, mediaUrl, content);
    }

    // If YouTube returned quota error anyway, schedule for next reset instead of leaving it failed
    if (result.status === 429 || (result.error && /quota|rateLimitExceeded|RESOURCE_EXHAUSTED/i.test(result.error))) {
      const nextReset = nextPacificMidnightUTC();
      const reason = `YouTube quota exceeded. Scheduled to retry after ${nextReset.toISOString()}.`;
      await scheduleYouTubePost(supabase, userId, nextReset, reason);
      return { platform: "youtube", success: false, error: reason };
    }

    if (result.error || !result.id) {
      return { platform: "youtube", success: false, error: result.error || "Unknown YouTube upload error" };
    }

    return { platform: "youtube", success: true, postId: result.id };
  } catch (err) {
    return { platform: "youtube", success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

async function postToLinkedIn(content: string, mediaUrl: string | null, credentials: any): Promise<PostResult> {
  // LinkedIn requires OAuth 2.0 flow
  return { platform: "linkedin", success: false, error: "LinkedIn auto-posting requires OAuth setup. Please configure LinkedIn API credentials." };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { platforms, content, mediaUrl } = await req.json();
    if (!Array.isArray(platforms) || platforms.length === 0 || typeof content !== "string" || !content.trim()) {
      return new Response(JSON.stringify({ error: "Invalid request payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmedContent = content.trim();

    // Get social media credentials
    const { data: credentials } = await supabase
      .from("social_media_credentials")
      .select("*")
      .eq("user_id", user.id)
      .single();

    let normalizedMediaUrl: string | null;
    try {
      normalizedMediaUrl = await normalizeMediaUrl(supabase, mediaUrl ?? null, user.id);
    } catch (error) {
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Invalid media payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: PostResult[] = [];

    for (const platform of platforms) {
      let result: PostResult;
      switch (platform) {
        case "facebook":
          result = await postToFacebook(trimmedContent, normalizedMediaUrl, credentials || {});
          break;
        case "instagram":
          result = await postToInstagram(trimmedContent, normalizedMediaUrl, credentials || {});
          break;
        case "x":
          result = await postToX(trimmedContent, normalizedMediaUrl, credentials || {});
          break;
        case "youtube":
          result = await postToYouTube(trimmedContent, normalizedMediaUrl, credentials || {}, supabase, user.id);
          break;
        case "linkedin":
          result = await postToLinkedIn(trimmedContent, normalizedMediaUrl, credentials || {});
          break;
        default:
          result = { platform, success: false, error: `Unsupported platform: ${platform}` };
      }
      results.push(result);

      // Update post status in DB
      const status = result.success ? "posted" : "failed";
      await supabase
        .from("social_media_posts")
        .update({
          status,
          error_message: result.error || null,
          media_url: normalizedMediaUrl,
          platform_post_id: result.postId || null,
          posted_at: result.success ? new Date().toISOString() : null,
        })
        .eq("user_id", user.id)
        .eq("platform", platform)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Social posting error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
