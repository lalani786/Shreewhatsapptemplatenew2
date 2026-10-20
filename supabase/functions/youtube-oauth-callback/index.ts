import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.0";

async function verifyState(state: string): Promise<string | null> {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [userId, ts, sig] = parts;
  // Expire after 15 minutes
  if (Date.now() - Number(ts) > 15 * 60 * 1000) return null;
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "fallback";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${userId}.${ts}`));
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expected)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return expectedB64 === sig ? userId : null;
}

function htmlPage(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:60px auto;padding:24px;line-height:1.5;color:#0f172a}
.card{border:1px solid #e2e8f0;border-radius:12px;padding:24px;background:#fff}
h1{margin:0 0 12px;font-size:22px}.ok{color:#15803d}.err{color:#b91c1c}
code{background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:13px}
button{background:#25D366;color:#fff;border:0;padding:10px 16px;border-radius:8px;font-size:14px;cursor:pointer;margin-top:16px}
</style></head><body><div class="card">${body}</div>
<script>setTimeout(()=>{try{window.opener&&window.opener.postMessage({source:"youtube-oauth",done:true},"*")}catch(e){}},300)</script>
</body></html>`;
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errParam = url.searchParams.get("error");

    if (errParam) {
      return new Response(htmlPage("Failed", `<h1 class="err">Google denied access</h1><p>${errParam}</p><p>You can close this tab.</p>`),
        { status: 200, headers: { "Content-Type": "text/html" } });
    }
    if (!code || !state) {
      return new Response(htmlPage("Failed", `<h1 class="err">Missing code or state</h1>`),
        { status: 400, headers: { "Content-Type": "text/html" } });
    }
    const userId = await verifyState(state);
    if (!userId) {
      return new Response(htmlPage("Failed", `<h1 class="err">Invalid or expired state</h1><p>Please retry from the app.</p>`),
        { status: 400, headers: { "Content-Type": "text/html" } });
    }

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const redirectUri = `${supabaseUrl}/functions/v1/youtube-oauth-callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Token exchange failed:", tokenData);
      return new Response(htmlPage("Failed", `<h1 class="err">Token exchange failed</h1><p>${tokenData.error_description || tokenData.error || tokenRes.status}</p>`),
        { status: 200, headers: { "Content-Type": "text/html" } });
    }

    // Try to fetch the channel ID for convenience
    let channelId: string | undefined;
    try {
      const chRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const chData = await chRes.json();
      channelId = chData.items?.[0]?.id;
    } catch {}

    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const update: Record<string, any> = {
      youtube_access_token: tokenData.access_token,
      updated_at: new Date().toISOString(),
    };
    if (tokenData.refresh_token) update.youtube_refresh_token = tokenData.refresh_token;
    if (channelId) update.youtube_channel_id = channelId;

    const { error } = await supabase
      .from("social_media_credentials")
      .upsert({ user_id: userId, ...update }, { onConflict: "user_id" });

    if (error) {
      console.error("DB save failed:", error);
      return new Response(htmlPage("Failed", `<h1 class="err">Failed to save tokens</h1><p>${error.message}</p>`),
        { status: 200, headers: { "Content-Type": "text/html" } });
    }

    return new Response(
      htmlPage("Connected",
        `<h1 class="ok">YouTube connected ✓</h1>
         <p>Your access and refresh tokens have been saved.${channelId ? ` Channel ID: <code>${channelId}</code>` : ""}</p>
         <p>You can close this tab and return to the app.</p>
         <button onclick="window.close()">Close</button>`),
      { status: 200, headers: { "Content-Type": "text/html" } });
  } catch (e) {
    console.error("youtube-oauth-callback error:", e);
    return new Response(htmlPage("Failed", `<h1 class="err">Error</h1><p>${e instanceof Error ? e.message : "Unknown"}</p>`),
      { status: 500, headers: { "Content-Type": "text/html" } });
  }
});
