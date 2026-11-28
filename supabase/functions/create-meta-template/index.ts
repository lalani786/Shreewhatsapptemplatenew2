import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
}

interface CreateTemplateRequest {
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  header?: {
    format: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
    text?: string;
    // Sample media for non-TEXT headers (Meta requires an example)
    sample_data_url?: string;      // data:<mime>;base64,....
    sample_file_name?: string;     // e.g. sample.mp4
    sample_mime_type?: string;     // e.g. video/mp4
    // OR user-supplied Meta media handle directly
    header_handle?: string;
    // OR a public URL that we'll fetch and upload
    sample_url?: string;
  } | null;
  body: string;
  body_examples?: string[]; // sample values for {{1}}, {{2}}, ...
  footer?: string;
  buttons?: TemplateButton[];
  waba_id?: string;
  meta_app_id?: string;
}


// deno-lint-ignore no-explicit-any
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function fetchAsBytes(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch sample URL (${r.status})`);
  const mime = r.headers.get("content-type") || "application/octet-stream";
  const buf = new Uint8Array(await r.arrayBuffer());
  return { bytes: buf, mime };
}

/**
 * Upload sample media using Meta's Resumable Upload API and return a header_handle.
 * Docs: https://developers.facebook.com/docs/graph-api/guides/upload
 */
async function uploadSampleToMeta(opts: {
  appId: string;
  accessToken: string;
  apiVersion: string;
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}): Promise<string> {
  const { appId, accessToken, apiVersion, bytes, fileName, mimeType } = opts;

  // 1) Create upload session
  const sessRes = await fetch(
    `https://graph.facebook.com/${apiVersion}/${appId}/uploads?` +
      new URLSearchParams({
        file_name: fileName,
        file_length: String(bytes.byteLength),
        file_type: mimeType,
        access_token: accessToken,
      }),
    { method: "POST" }
  );
  const sessJson = await sessRes.json().catch(() => ({}));
  if (!sessRes.ok || !sessJson?.id) {
    throw new Error(
      sessJson?.error?.error_user_msg ||
        sessJson?.error?.message ||
        `Failed to create upload session (${sessRes.status})`
    );
  }
  const sessionId: string = sessJson.id; // "upload:XXXX"

  // 2) Upload bytes
  const upRes = await fetch(`https://graph.facebook.com/${apiVersion}/${sessionId}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${accessToken}`,
      file_offset: "0",
      "Content-Type": "application/octet-stream",
    },
    body: bytes,
  });
  const upJson = await upRes.json().catch(() => ({}));
  if (!upRes.ok || !upJson?.h) {
    throw new Error(
      upJson?.error?.error_user_msg ||
        upJson?.error?.message ||
        `Failed to upload sample bytes (${upRes.status})`
    );
  }
  return upJson.h as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: CreateTemplateRequest = await req.json();

    if (!body.name || !body.body || !body.category || !body.language) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: name, category, language, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: creds } = await supabase
      .from("api_credentials")
      .select("*")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const accessToken = creds?.whatsapp_access_token;
    const apiVersion = creds?.whatsapp_api_version || "v21.0";
    // deno-lint-ignore no-explicit-any
    const c: any = creds || {};
    const wabaId = body.waba_id || c.whatsapp_business_account_id;
    const metaAppId = body.meta_app_id || c.meta_app_id || Deno.env.get("META_APP_ID");

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "WhatsApp Access Token missing. Configure it in API Setup." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!wabaId) {
      return new Response(
        JSON.stringify({
          error:
            "WhatsApp Business Account ID (WABA ID) missing. Add it in the dialog or API Setup. Find it in Meta Business Manager > WhatsApp Accounts.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Build HEADER component with sample media handle when needed ----
    const isMediaHeader =
      !!body.header && body.header.format !== "TEXT" && body.header.format !== undefined;

    let headerComponent: Record<string, unknown> | null = null;

    if (body.header?.format === "TEXT" && body.header.text?.trim()) {
      headerComponent = { type: "HEADER", format: "TEXT", text: body.header.text.trim() };
    } else if (isMediaHeader) {
      // We need a header_handle example. Priority:
      // 1) explicit header_handle from client
      // 2) upload provided sample bytes / URL
      let handle = body.header!.header_handle?.trim();

      if (!handle) {
        // Need to upload — require Meta App ID
        if (!metaAppId) {
          return new Response(
            JSON.stringify({
              error:
                "Meta App ID is required to upload a sample for IMAGE/VIDEO/DOCUMENT header templates. Add it in API Setup (field: meta_app_id) or paste a Meta header_handle directly.",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let bytes: Uint8Array | null = null;
        let mime = body.header!.sample_mime_type || "";
        let fileName = body.header!.sample_file_name || "sample";

        if (body.header!.sample_data_url) {
          const m = body.header!.sample_data_url.match(/^data:([^;]+);base64,(.*)$/);
          if (!m) {
            return new Response(
              JSON.stringify({ error: "Invalid sample_data_url (must be base64 data URL)" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          mime = mime || m[1];
          bytes = b64ToBytes(m[2]);
        } else if (body.header!.sample_url) {
          const fetched = await fetchAsBytes(body.header!.sample_url);
          bytes = fetched.bytes;
          mime = mime || fetched.mime;
        } else {
          return new Response(
            JSON.stringify({
              error: `A sample ${body.header!.format.toLowerCase()} is required for this header type. Upload a sample file (or provide a header_handle).`,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!fileName.includes(".")) {
          const ext = mime.split("/")[1] || "bin";
          fileName = `${fileName}.${ext}`;
        }

        try {
          handle = await uploadSampleToMeta({
            appId: metaAppId,
            accessToken,
            apiVersion,
            bytes: bytes!,
            fileName,
            mimeType: mime,
          });
        } catch (e) {
          return new Response(
            JSON.stringify({
              error: `Sample upload to Meta failed: ${e instanceof Error ? e.message : String(e)}`,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      headerComponent = {
        type: "HEADER",
        format: body.header!.format,
        example: { header_handle: [handle] },
      };
    }

    // ---- BODY component (with variable examples if any) ----
    const varCount = (body.body.match(/\{\{\d+\}\}/g) || []).length;
    const bodyComponent: Record<string, unknown> = { type: "BODY", text: body.body };
    if (varCount > 0) {
      const examples = (body.body_examples || []).slice(0, varCount);
      while (examples.length < varCount) examples.push(`sample_${examples.length + 1}`);
      bodyComponent.example = { body_text: [examples] };
    }

    const components: unknown[] = [];
    if (headerComponent) components.push(headerComponent);
    components.push(bodyComponent);
    if (body.footer?.trim()) {
      components.push({ type: "FOOTER", text: body.footer.trim() });
    }
    if (body.buttons && body.buttons.length > 0) {
      components.push({ type: "BUTTONS", buttons: body.buttons });
    }

    const url = `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates`;
    const payload = {
      name: body.name,
      category: body.category,
      language: body.language,
      components,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const respData = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const errMsg =
        respData?.error?.error_user_msg ||
        respData?.error?.message ||
        `Meta API HTTP ${resp.status}`;
      return new Response(
        JSON.stringify({ error: errMsg, meta: respData?.error, sent: payload }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      await supabase.from("templates").insert({
        user_id: userData.user.id,
        name: body.name,
        content: body.body,
      });
    } catch (_) { /* ignore */ }

    return new Response(
      JSON.stringify({
        success: true,
        template_id: respData?.id,
        status: respData?.status,
        category: respData?.category,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-meta-template error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
