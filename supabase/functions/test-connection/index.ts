import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function testFacebook(creds: any): Promise<{ success: boolean; message: string }> {
  const { facebook_page_id, facebook_page_access_token } = creds;
  if (!facebook_page_id || !facebook_page_access_token) {
    return { success: false, message: "Page ID and Page Access Token are required" };
  }
  const res = await fetch(
    `https://graph.facebook.com/v18.0/${facebook_page_id}?fields=name,id,category,tasks&access_token=${facebook_page_access_token}`
  );
  const data = await res.json();
  if (!res.ok) {
    const errMsg = data.error?.message || `HTTP ${res.status}`;
    if (errMsg.includes("publish_actions")) {
      return {
        success: false,
        message: "Error (#200): 'publish_actions' is deprecated. Facebook has permanently prohibited automated posting to personal user profiles. Ensure you configured a Facebook Page ID and Page Access Token.",
      };
    }
    if (errMsg.includes("Permissions error")) {
      return {
        success: false,
        message: "Error (#200 Permissions error): Token lacks posting permission for this Page. Ensure 'pages_manage_posts' and 'pages_read_engagement' scopes are granted in Meta Graph API Explorer.",
      };
    }
    return { success: false, message: errMsg };
  }

  // Verify that the ID represents a Facebook Page, not a personal user profile
  if (!data.category) {
    return {
      success: false,
      message: `The ID "${facebook_page_id}" belongs to a personal User profile (${data.name}), NOT a Facebook Page. Facebook deprecated 'publish_actions' and prohibits posting to personal profiles. Please use your Facebook Page ID and Page Access Token from GET /me/accounts.`,
    };
  }

  // Check tasks permission on the Page
  if (Array.isArray(data.tasks) && !data.tasks.includes("CREATE_CONTENT") && !data.tasks.includes("MANAGE")) {
    return {
      success: false,
      message: `Token has READ-ONLY access to "${data.name}". It is missing the 'CREATE_CONTENT' permission. In Meta Graph API Explorer, grant 'pages_manage_posts' and regenerate your Page token.`,
    };
  }

  // Check if token is a Page Token vs User Token
  try {
    const meRes = await fetch(
      `https://graph.facebook.com/v18.0/me?fields=id,name&access_token=${facebook_page_access_token}`
    );
    const meData = await meRes.json();
    if (meRes.ok && meData.id && String(meData.id) !== String(facebook_page_id)) {
      return {
        success: false,
        message: `Connected to Page "${data.name}", but the token provided is a USER token (${meData.name}), NOT a Page token. Video/photo publishing requires a Page Access Token (from Graph API Explorer -> Page Token, or GET /me/accounts).`,
      };
    }
  } catch {
    // Non-blocking fallback
  }

  return { success: true, message: `Connected to Facebook Page: ${data.name} (${data.id}) with publish permissions ✓` };
}

async function fetchFacebookPages(token: string): Promise<{ success: boolean; message: string; pages?: any[] }> {
  if (!token) {
    return { success: false, message: "Please paste your Meta Access Token first." };
  }
  const res = await fetch(
    `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,category,access_token&access_token=${token}`
  );
  const data = await res.json();
  if (!res.ok) {
    return { success: false, message: data.error?.message || `HTTP ${res.status}` };
  }
  const pages = data.data || [];
  if (pages.length === 0) {
    return {
      success: false,
      message: "No Facebook Pages found for this account. Ensure your Facebook user account is an Admin/Editor of a Facebook Page.",
    };
  }
  return {
    success: true,
    message: `Found ${pages.length} Facebook Page${pages.length > 1 ? "s" : ""}`,
    pages: pages.map((p: any) => ({
      id: p.id,
      name: p.name,
      category: p.category || "Facebook Page",
      access_token: p.access_token,
    })),
  };
}

async function testInstagram(creds: any): Promise<{ success: boolean; message: string }> {
  const { instagram_business_account_id, instagram_access_token, facebook_page_access_token } = creds;
  const token = instagram_access_token || facebook_page_access_token;
  if (!instagram_business_account_id || !token) {
    return { success: false, message: "Instagram Node ID and Access Token are required" };
  }

  // Validate the token by querying the Instagram node directly
  const res = await fetch(
    `https://graph.facebook.com/v18.0/${instagram_business_account_id}?fields=id,name&access_token=${token}`
  );
  const data = await res.json();
  if (!res.ok) {
    return { success: false, message: data.error?.message || `HTTP ${res.status}` };
  }

  const name = data.name || data.id;
  return { success: true, message: `Instagram connected: ${name} (${data.id})` };
}

async function testX(creds: any): Promise<{ success: boolean; message: string }> {
  const { x_bearer_token } = creds;
  if (!x_bearer_token) {
    return { success: false, message: "Bearer Token is required" };
  }
  const res = await fetch("https://api.x.com/2/users/me", {
    headers: { Authorization: `Bearer ${x_bearer_token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    return { success: false, message: data.detail || data.title || `HTTP ${res.status}` };
  }
  return { success: true, message: `Connected as: @${data.data?.username} (${data.data?.name})` };
}

async function testTelegram(creds: any): Promise<{ success: boolean; message: string }> {
  const { telegram_bot_token, telegram_channel_id } = creds;
  if (!telegram_bot_token) {
    return { success: false, message: "Bot Token is required" };
  }
  const res = await fetch(`https://api.telegram.org/bot${telegram_bot_token}/getMe`);
  const data = await res.json();
  if (!data.ok) {
    return { success: false, message: data.description || "Invalid bot token" };
  }
  let msg = `Bot connected: @${data.result.username}`;
  if (telegram_channel_id) {
    const chatRes = await fetch(
      `https://api.telegram.org/bot${telegram_bot_token}/getChat`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: telegram_channel_id }) }
    );
    const chatData = await chatRes.json();
    if (chatData.ok) {
      msg += ` | Channel: ${chatData.result.title || telegram_channel_id}`;
    } else {
      msg += ` | ⚠️ Channel not found: ${chatData.description}`;
    }
  }
  return { success: true, message: msg };
}

async function refreshYouTubeToken(refreshToken: string): Promise<{ access_token?: string; error?: string }> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return { error: "Server missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" };
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    console.error("YouTube token refresh failed:", { status: res.status, data });
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    // Common case: invalid_grant means refresh token was revoked / expired / wrong client
    const hint = data.error === "invalid_grant"
      ? " (refresh token revoked or issued by a different Google client — please re-authorize YouTube)"
      : data.error === "invalid_client"
        ? " (GOOGLE_CLIENT_ID/SECRET don't match the client that issued this refresh token)"
        : "";
    return { error: `${detail}${hint}` };
  }
  return { access_token: data.access_token };
}

async function callYouTubeChannels(token: string) {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  return { res, data };
}

async function testYouTube(creds: any, ctx: { supabase: any; userId: string }): Promise<{ success: boolean; message: string }> {
  let { youtube_access_token, youtube_refresh_token } = creds;
  if (!youtube_access_token && !youtube_refresh_token) {
    return { success: false, message: "Access Token (or Refresh Token) is required" };
  }

  let { res, data } = youtube_access_token
    ? await callYouTubeChannels(youtube_access_token)
    : { res: { ok: false, status: 401 } as Response, data: { error: { message: "no access token" } } };

  if (!res.ok && (res.status === 401 || data?.error?.status === "UNAUTHENTICATED" || /invalid.*credentials/i.test(data?.error?.message || ""))) {
    if (!youtube_refresh_token) {
      return { success: false, message: "Access token expired and no refresh token saved. Please re-authorize YouTube." };
    }
    const refresh = await refreshYouTubeToken(youtube_refresh_token);
    if (refresh.error || !refresh.access_token) {
      return { success: false, message: `Token refresh failed: ${refresh.error}` };
    }
    // Save new token
    await ctx.supabase
      .from("social_media_credentials")
      .update({ youtube_access_token: refresh.access_token, updated_at: new Date().toISOString() })
      .eq("user_id", ctx.userId);
    // Retry
    ({ res, data } = await callYouTubeChannels(refresh.access_token));
    if (!res.ok) {
      return { success: false, message: data.error?.message || `HTTP ${res.status} after refresh` };
    }
    const channel = data.items?.[0];
    return { success: true, message: `🔄 Refreshed token. Connected to: ${channel?.snippet?.title || "(no channel)"}` };
  }

  if (!res.ok) {
    return { success: false, message: data.error?.message || `HTTP ${res.status}` };
  }
  const channel = data.items?.[0];
  return { success: true, message: channel ? `Connected to: ${channel.snippet.title}` : "Token valid but no channel found" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { platform, token: inputToken } = body;
    if (!platform) {
      return new Response(JSON.stringify({ error: "Platform is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (platform === "facebook_get_pages") {
      const { data: creds } = await supabase
        .from("social_media_credentials")
        .select("facebook_page_access_token")
        .eq("user_id", user.id)
        .maybeSingle();
      const tokenToUse = inputToken || creds?.facebook_page_access_token;
      const resPages = await fetchFacebookPages(tokenToUse);
      return new Response(JSON.stringify(resPages), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: credentials } = await supabase
      .from("social_media_credentials")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!credentials) {
      return new Response(JSON.stringify({ success: false, message: "No credentials saved. Please configure your credentials first." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: { success: boolean; message: string };
    switch (platform) {
      case "facebook": result = await testFacebook(credentials); break;
      case "instagram": result = await testInstagram(credentials); break;
      case "x": result = await testX(credentials); break;
      case "telegram": result = await testTelegram(credentials); break;
      case "youtube": result = await testYouTube(credentials, { supabase, userId: user.id }); break;
      case "linkedin": result = { success: false, message: "LinkedIn test requires OAuth setup (not yet supported)" }; break;
      default: result = { success: false, message: `Unsupported platform: ${platform}` };
    }

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Test connection error:", error);
    return new Response(
      JSON.stringify({ success: false, message: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
