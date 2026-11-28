import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SendMessageRequest {
  contactId: string;
  message: string;
  messageType?: "text" | "image" | "template";
  imageUrl?: string;
}

// Helper function to upload base64 image to Supabase Storage
// deno-lint-ignore no-explicit-any
async function uploadImageToStorage(
  supabase: any,
  base64Data: string,
  userId: string
): Promise<string | null> {
  try {
    // Extract mime type and base64 content
    const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      console.error("Invalid base64 format");
      return null;
    }

    const mimeType = matches[1];
    const base64Content = matches[2];
    
    // Convert base64 to Uint8Array
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Determine file extension
    const extension = mimeType.split("/")[1] || "png";
    const fileName = `${userId}/${Date.now()}.${extension}`;

    // Upload to storage
    const { data, error } = await supabase.storage
      .from("whatsapp-media")
      .upload(fileName, bytes, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      console.error("Storage upload error:", error);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("whatsapp-media")
      .getPublicUrl(data.path);

    console.log("Image uploaded successfully:", urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error("Error uploading image:", error);
    return null;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Get auth header for user authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with service role for storage operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("User authenticated:", user.id);

    const { contactId, message, messageType = "text", imageUrl }: SendMessageRequest = await req.json();

    if (!contactId || !message) {
      return new Response(
        JSON.stringify({ error: "Missing contactId or message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Message type:", messageType, "Has image:", !!imageUrl);

    // Get user's WhatsApp API credentials
    const { data: credentials, error: credError } = await supabase
      .from("api_credentials")
      .select("whatsapp_phone_id, whatsapp_access_token, whatsapp_api_version")
      .eq("user_id", user.id)
      .single();

    if (credError || !credentials?.whatsapp_phone_id || !credentials?.whatsapp_access_token) {
      console.error("Credentials error:", credError);
      return new Response(
        JSON.stringify({ error: "WhatsApp API credentials not configured. Please set up your API credentials first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Credentials found for user");

    // Get contact phone number
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("phone, name")
      .eq("id", contactId)
      .eq("user_id", user.id)
      .single();

    if (contactError || !contact) {
      console.error("Contact error:", contactError);
      return new Response(
        JSON.stringify({ error: "Contact not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format phone number (remove + and spaces)
    const formattedPhone = contact.phone.replace(/[\s+\-()]/g, "");
    console.log("Sending message to:", formattedPhone);

    // Send message via WhatsApp Cloud API
    const apiVersion = credentials.whatsapp_api_version || "v18.0";
    const whatsappUrl = `https://graph.facebook.com/${apiVersion}/${credentials.whatsapp_phone_id}/messages`;

    // Build WhatsApp payload based on message type
    let whatsappPayload: Record<string, unknown>;
    
    if (messageType === "image" && imageUrl) {
      // Handle image upload if it's a base64 data URL
      let finalImageUrl = imageUrl;
      
      if (imageUrl.startsWith("data:")) {
        console.log("Uploading base64 image to storage...");
        const uploadedUrl = await uploadImageToStorage(supabase, imageUrl, user.id);
        
        if (!uploadedUrl) {
          return new Response(
            JSON.stringify({ error: "Failed to upload image. Please try again." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        finalImageUrl = uploadedUrl;
      }
      
      // For image messages with caption
      whatsappPayload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "image",
        image: {
          link: finalImageUrl,
          caption: message,
        },
      };
      console.log("Sending image message with caption, URL:", finalImageUrl);
    } else {
      // Text message
      whatsappPayload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "text",
        text: { preview_url: false, body: message },
      };
    }

    console.log("WhatsApp API URL:", whatsappUrl);

    const whatsappResponse = await fetch(whatsappUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${credentials.whatsapp_access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(whatsappPayload),
    });

    const whatsappResult = await whatsappResponse.json();
    console.log("WhatsApp API Response:", JSON.stringify(whatsappResult, null, 2));

    if (!whatsappResponse.ok) {
      console.error("WhatsApp API error:", whatsappResult);
      
      // Handle specific WhatsApp errors
      let errorMessage = "Failed to send message via WhatsApp";
      if (whatsappResult.error?.message) {
        errorMessage = whatsappResult.error.message;
      }
      if (whatsappResult.error?.error_data?.details) {
        errorMessage += `: ${whatsappResult.error.error_data.details}`;
      }

      // Still save the message to database with failed status
      await supabase.from("messages").insert({
        user_id: user.id,
        contact_id: contactId,
        content: message,
        message_type: messageType,
        direction: "outgoing",
        status: "failed",
      });

      return new Response(
        JSON.stringify({ error: errorMessage, details: whatsappResult.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save message to database with sent status
    const { data: savedMessage, error: saveError } = await supabase
      .from("messages")
      .insert({
        user_id: user.id,
        contact_id: contactId,
        content: message,
        message_type: messageType,
        direction: "outgoing",
        status: "sent",
      })
      .select()
      .single();

    if (saveError) {
      console.error("Save error:", saveError);
    }

    // Log analytics event
    await supabase.from("analytics_events").insert({
      user_id: user.id,
      event_type: "message_sent",
      message_id: savedMessage?.id,
      metadata: {
        whatsapp_message_id: whatsappResult.messages?.[0]?.id,
        contact_name: contact.name,
      },
    });

    console.log("Message sent successfully");

    return new Response(
      JSON.stringify({
        success: true,
        messageId: savedMessage?.id,
        whatsappMessageId: whatsappResult.messages?.[0]?.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
