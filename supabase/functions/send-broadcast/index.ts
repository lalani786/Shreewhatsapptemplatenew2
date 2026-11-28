import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface BroadcastRequest {
  campaignName: string;
  message: string;
  contactIds: string[];
  imageUrl?: string;
}

interface SendResult {
  contactId: string;
  contactName: string;
  phone: string;
  success: boolean;
  error?: string;
  whatsappMessageId?: string;
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
    const fileName = `${userId}/broadcast-${Date.now()}.${extension}`;

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with service role for storage operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    const { campaignName, message, contactIds, imageUrl }: BroadcastRequest = await req.json();

    if (!campaignName || !message || !contactIds?.length) {
      return new Response(
        JSON.stringify({ error: "Missing campaignName, message, or contactIds" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting broadcast "${campaignName}" to ${contactIds.length} contacts`);
    console.log(`Has image attachment: ${!!imageUrl}`);

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

    // Get contacts
    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select("id, phone, name")
      .in("id", contactIds)
      .eq("user_id", user.id);

    if (contactsError || !contacts?.length) {
      console.error("Contacts error:", contactsError);
      return new Response(
        JSON.stringify({ error: "No valid contacts found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${contacts.length} contacts`);

    // Handle image upload if it's a base64 data URL (upload once, use for all)
    let finalImageUrl: string | null = null;
    if (imageUrl) {
      if (imageUrl.startsWith("data:")) {
        console.log("Uploading base64 image to storage for broadcast...");
        finalImageUrl = await uploadImageToStorage(supabase, imageUrl, user.id);
        
        if (!finalImageUrl) {
          return new Response(
            JSON.stringify({ error: "Failed to upload image. Please try again." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.log("Image uploaded, public URL:", finalImageUrl);
      } else {
        finalImageUrl = imageUrl;
      }
    }

    // Create campaign record
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        user_id: user.id,
        name: campaignName,
        message_content: message,
        contact_ids: contactIds,
        status: "sending",
        sent_count: 0,
      })
      .select()
      .single();

    if (campaignError) {
      console.error("Campaign creation error:", campaignError);
      return new Response(
        JSON.stringify({ error: "Failed to create campaign" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Campaign created:", campaign.id);

    const apiVersion = credentials.whatsapp_api_version || "v18.0";
    const whatsappUrl = `https://graph.facebook.com/${apiVersion}/${credentials.whatsapp_phone_id}/messages`;

    const results: SendResult[] = [];
    let successCount = 0;
    let failCount = 0;

    // Send messages to each contact
    for (const contact of contacts) {
      const formattedPhone = contact.phone.replace(/[\s+\-()]/g, "");
      
      console.log(`Sending to ${contact.name} (${formattedPhone})`);

      try {
        // Build payload based on message type
        let whatsappPayload: Record<string, unknown>;
        
        if (finalImageUrl) {
          // Image message with caption
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

        const whatsappResponse = await fetch(whatsappUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${credentials.whatsapp_access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(whatsappPayload),
        });

        const whatsappResult = await whatsappResponse.json();

        if (whatsappResponse.ok && whatsappResult.messages?.[0]?.id) {
          successCount++;
          results.push({
            contactId: contact.id,
            contactName: contact.name,
            phone: formattedPhone,
            success: true,
            whatsappMessageId: whatsappResult.messages[0].id,
          });

          // Save message to database
          await supabase.from("messages").insert({
            user_id: user.id,
            contact_id: contact.id,
            content: message,
            message_type: finalImageUrl ? "image" : "text",
            direction: "outgoing",
            status: "sent",
          });

          console.log(`✓ Sent to ${contact.name}`);
        } else {
          failCount++;
          const errorMsg = whatsappResult.error?.message || "Unknown error";
          results.push({
            contactId: contact.id,
            contactName: contact.name,
            phone: formattedPhone,
            success: false,
            error: errorMsg,
          });
          console.error(`✗ Failed for ${contact.name}: ${errorMsg}`);
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));

      } catch (err: unknown) {
        failCount++;
        const errorMsg = err instanceof Error ? err.message : "Send failed";
        results.push({
          contactId: contact.id,
          contactName: contact.name,
          phone: formattedPhone,
          success: false,
          error: errorMsg,
        });
        console.error(`✗ Error for ${contact.name}:`, err);
      }
    }

    // Update campaign status
    await supabase
      .from("campaigns")
      .update({
        status: failCount === 0 ? "sent" : "partial",
        sent_count: successCount,
      })
      .eq("id", campaign.id);

    // Log analytics event
    await supabase.from("analytics_events").insert({
      user_id: user.id,
      event_type: "broadcast_sent",
      campaign_id: campaign.id,
      metadata: {
        total_contacts: contacts.length,
        success_count: successCount,
        fail_count: failCount,
        has_image: !!finalImageUrl,
      },
    });

    console.log(`Broadcast complete: ${successCount} sent, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        campaignId: campaign.id,
        totalContacts: contacts.length,
        successCount,
        failCount,
        results,
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
