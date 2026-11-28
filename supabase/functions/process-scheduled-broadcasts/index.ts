import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Campaign {
  id: string;
  user_id: string;
  name: string;
  message_content: string;
  contact_ids: string[];
  scheduled_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("Processing scheduled broadcasts...");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find all scheduled campaigns that are due
    const now = new Date().toISOString();
    const { data: dueCampaigns, error: fetchError } = await supabase
      .from("campaigns")
      .select("id, user_id, name, message_content, contact_ids, scheduled_at")
      .eq("status", "scheduled")
      .lte("scheduled_at", now);

    if (fetchError) {
      console.error("Error fetching scheduled campaigns:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch scheduled campaigns" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!dueCampaigns || dueCampaigns.length === 0) {
      console.log("No scheduled campaigns due at this time");
      return new Response(
        JSON.stringify({ message: "No scheduled campaigns to process", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${dueCampaigns.length} campaigns to process`);

    const results: { campaignId: string; success: boolean; successCount?: number; failCount?: number; error?: string }[] = [];

    for (const campaign of dueCampaigns as Campaign[]) {
      console.log(`Processing campaign: ${campaign.name} (${campaign.id})`);

      // Mark campaign as sending
      await supabase
        .from("campaigns")
        .update({ status: "sending" })
        .eq("id", campaign.id);

      try {
        // Get user's WhatsApp API credentials
        const { data: credentials, error: credError } = await supabase
          .from("api_credentials")
          .select("whatsapp_phone_id, whatsapp_access_token, whatsapp_api_version")
          .eq("user_id", campaign.user_id)
          .single();

        if (credError || !credentials?.whatsapp_phone_id || !credentials?.whatsapp_access_token) {
          console.error(`No API credentials for user ${campaign.user_id}`);
          await supabase
            .from("campaigns")
            .update({ status: "failed" })
            .eq("id", campaign.id);
          results.push({ campaignId: campaign.id, success: false, error: "No API credentials configured" });
          continue;
        }

        // Get contacts
        const { data: contacts, error: contactsError } = await supabase
          .from("contacts")
          .select("id, phone, name")
          .in("id", campaign.contact_ids)
          .eq("user_id", campaign.user_id);

        if (contactsError || !contacts?.length) {
          console.error(`No valid contacts for campaign ${campaign.id}`);
          await supabase
            .from("campaigns")
            .update({ status: "failed" })
            .eq("id", campaign.id);
          results.push({ campaignId: campaign.id, success: false, error: "No valid contacts found" });
          continue;
        }

        console.log(`Sending to ${contacts.length} contacts`);

        const apiVersion = credentials.whatsapp_api_version || "v18.0";
        const whatsappUrl = `https://graph.facebook.com/${apiVersion}/${credentials.whatsapp_phone_id}/messages`;

        let successCount = 0;
        let failCount = 0;

        // Send messages to each contact
        for (const contact of contacts) {
          const formattedPhone = contact.phone.replace(/[\s+\-()]/g, "");

          try {
            const whatsappPayload = {
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: formattedPhone,
              type: "text",
              text: { preview_url: false, body: campaign.message_content },
            };

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

              // Save message to database
              await supabase.from("messages").insert({
                user_id: campaign.user_id,
                contact_id: contact.id,
                content: campaign.message_content,
                message_type: "text",
                direction: "outgoing",
                status: "sent",
              });

              console.log(`✓ Sent to ${contact.name}`);
            } else {
              failCount++;
              console.error(`✗ Failed for ${contact.name}: ${whatsappResult.error?.message || "Unknown error"}`);
            }

            // Small delay to avoid rate limiting
            await new Promise((resolve) => setTimeout(resolve, 100));

          } catch (err) {
            failCount++;
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
          user_id: campaign.user_id,
          event_type: "scheduled_broadcast_sent",
          campaign_id: campaign.id,
          metadata: {
            total_contacts: contacts.length,
            success_count: successCount,
            fail_count: failCount,
            scheduled_at: campaign.scheduled_at,
          },
        });

        console.log(`Campaign ${campaign.name} complete: ${successCount} sent, ${failCount} failed`);
        results.push({ campaignId: campaign.id, success: true, successCount, failCount });

      } catch (err) {
        console.error(`Error processing campaign ${campaign.id}:`, err);
        await supabase
          .from("campaigns")
          .update({ status: "failed" })
          .eq("id", campaign.id);
        results.push({ campaignId: campaign.id, success: false, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    console.log(`Processed ${results.length} campaigns`);

    return new Response(
      JSON.stringify({
        message: `Processed ${results.length} scheduled campaigns`,
        processed: results.length,
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
