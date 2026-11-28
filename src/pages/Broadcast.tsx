import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Radio, Send, Users, Loader2, Image, Clock, Calendar } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { BroadcastMediaUpload } from "@/components/broadcast/BroadcastMediaUpload";
import { CampaignHistory } from "@/components/broadcast/CampaignHistory";

interface Contact {
  id: string;
  name: string;
  phone: string;
}

interface Template {
  id: string;
  name: string;
  content: string;
  image_prompt?: string;
}

interface Campaign {
  id: string;
  name: string;
  message_content: string;
  status: string;
  sent_count: number | null;
  delivered_count: number | null;
  read_count: number | null;
  created_at: string;
  contact_ids: string[] | null;
  scheduled_at: string | null;
}

export default function Broadcast() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [contactsRes, templatesRes, campaignsRes] = await Promise.all([
      supabase.from("contacts").select("id, name, phone").order("name"),
      supabase.from("templates").select("id, name, content, image_prompt").order("created_at", { ascending: false }),
      supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
    ]);

    if (contactsRes.data) setContacts(contactsRes.data);
    if (templatesRes.data) setTemplates(templatesRes.data);
    if (campaignsRes.data) setCampaigns(campaignsRes.data);
  };

  const handleTemplateImport = (template: Template) => {
    setMessageContent(template.content);
    toast.success(`Template "${template.name}" imported`);
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setMessageContent(template.content);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedContacts(contacts.map((c) => c.id));
    } else {
      setSelectedContacts([]);
    }
  };

  const handleContactToggle = (contactId: string) => {
    setSelectedContacts((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    );
  };

  const handleSendCampaign = async () => {
    if (!campaignName.trim()) {
      toast.error("Please enter a campaign name");
      return;
    }
    if (!messageContent.trim()) {
      toast.error("Please enter a message");
      return;
    }
    if (selectedContacts.length === 0) {
      toast.error("Please select at least one contact");
      return;
    }

    // Validate scheduled date/time if scheduling
    if (isScheduled) {
      if (!scheduledDate || !scheduledTime) {
        toast.error("Please select both date and time for scheduling");
        return;
      }
      const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
      if (scheduledDateTime <= new Date()) {
        toast.error("Scheduled time must be in the future");
        return;
      }
    }

    setIsSending(true);
    
    try {
      if (isScheduled) {
        // Create scheduled campaign in database
        const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error("Please log in to schedule campaigns");
          setIsSending(false);
          return;
        }

        const { error: insertError } = await supabase
          .from("campaigns")
          .insert({
            user_id: user.id,
            name: campaignName.trim(),
            message_content: messageContent.trim(),
            contact_ids: selectedContacts,
            status: "scheduled",
            scheduled_at: scheduledAt,
            sent_count: 0,
          });

        if (insertError) {
          console.error("Schedule error:", insertError);
          toast.error("Failed to schedule campaign");
        } else {
          toast.success(`Campaign scheduled for ${format(new Date(scheduledAt), "PPp")}`);
          resetForm();
          fetchData();
        }
      } else {
        // Send immediately
        const { data, error } = await supabase.functions.invoke("send-broadcast", {
          body: {
            campaignName: campaignName.trim(),
            message: messageContent.trim(),
            contactIds: selectedContacts,
            imageUrl: selectedImage,
          },
        });

        if (error) {
          console.error("Broadcast error:", error);
          toast.error("Failed to send broadcast");
        } else if (data?.error) {
          console.error("API error:", data.error);
          toast.error(data.error);
        } else {
          const { successCount, failCount } = data;
          if (failCount === 0) {
            toast.success(`Campaign sent to ${successCount} contacts via WhatsApp!`);
          } else {
            toast.warning(`Sent to ${successCount} contacts, ${failCount} failed`);
          }
          resetForm();
          fetchData();
        }
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error("Failed to send/schedule broadcast");
    }
    
    setIsSending(false);
  };

  const resetForm = () => {
    setCampaignName("");
    setMessageContent("");
    setSelectedContacts([]);
    setSelectedTemplate("");
    setSelectedImage(null);
    setIsScheduled(false);
    setScheduledDate("");
    setScheduledTime("");
  };

  // Get minimum date (today) for the date picker
  const getMinDate = () => {
    return format(new Date(), "yyyy-MM-dd");
  };

  // Get minimum time if the selected date is today
  const getMinTime = () => {
    if (scheduledDate === getMinDate()) {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 5); // At least 5 minutes from now
      return format(now, "HH:mm");
    }
    return "00:00";
  };


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Broadcast</h1>
        <p className="text-muted-foreground">Send bulk WhatsApp campaigns to your contacts</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Campaign Creator */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5" />
              Create Campaign
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="campaign-name">Campaign Name</Label>
                <Input
                  id="campaign-name"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="Diwali Sale 2024"
                />
              </div>

              <div className="space-y-2">
                <Label>Use Template</Label>
                <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message Content</Label>
              <Textarea
                id="message"
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                placeholder="Write your campaign message..."
                rows={5}
              />
            </div>

            {selectedImage && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Image className="h-4 w-4" />
                <span>Image attached to campaign</span>
              </div>
            )}

            {/* Schedule Toggle */}
            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="schedule-toggle" className="font-medium">
                    Schedule for later
                  </Label>
                </div>
                <Switch
                  id="schedule-toggle"
                  checked={isScheduled}
                  onCheckedChange={(checked) => {
                    setIsScheduled(checked);
                    if (checked) {
                      // Auto-fill with current date and time (rounded to next 5 min)
                      const now = new Date();
                      now.setMinutes(now.getMinutes() + 5);
                      now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5);
                      setScheduledDate(format(now, "yyyy-MM-dd"));
                      setScheduledTime(format(now, "HH:mm"));
                    }
                  }}
                />
              </div>

              {isScheduled && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="schedule-date" className="text-sm flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Date
                    </Label>
                    <Input
                      id="schedule-date"
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      min={getMinDate()}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="schedule-time" className="text-sm flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Time
                    </Label>
                    <Input
                      id="schedule-time"
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      min={getMinTime()}
                    />
                  </div>
                  {scheduledDate && scheduledTime && (
                    <div className="sm:col-span-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                      Campaign will be sent on{" "}
                      <span className="font-medium text-foreground">
                        {format(new Date(`${scheduledDate}T${scheduledTime}`), "PPp")}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button
              onClick={handleSendCampaign}
              disabled={
                isSending || 
                !campaignName.trim() || 
                !messageContent.trim() || 
                selectedContacts.length === 0 ||
                (isScheduled && (!scheduledDate || !scheduledTime))
              }
              className="w-full"
            >
              {isSending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : isScheduled ? (
                <Clock className="mr-2 h-4 w-4" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {isSending 
                ? (isScheduled ? "Scheduling..." : "Sending via WhatsApp...") 
                : isScheduled 
                  ? `Schedule for ${selectedContacts.length} contacts`
                  : `Send to ${selectedContacts.length} contacts`
              }
            </Button>
          </CardContent>
        </Card>

        {/* Media Upload & Contact Selection */}
        <div className="space-y-4">
          <BroadcastMediaUpload
            templates={templates}
            onTemplateSelect={handleTemplateImport}
            onImageSelect={(url) => setSelectedImage(url)}
            selectedImage={selectedImage}
            onRemoveImage={() => setSelectedImage(null)}
          />

          {/* Contact Selection */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" />
                  Select Contacts
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all"
                    checked={selectedContacts.length === contacts.length && contacts.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <Label htmlFor="select-all" className="text-sm">
                    All
                  </Label>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px]">
                {contacts.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm">
                    No contacts available. Add contacts first.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center gap-3 rounded-lg border p-2"
                      >
                        <Checkbox
                          checked={selectedContacts.includes(contact.id)}
                          onCheckedChange={() => handleContactToggle(contact.id)}
                        />
                        <div>
                          <p className="font-medium text-sm">{contact.name}</p>
                          <p className="text-xs text-muted-foreground">{contact.phone}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Campaign History */}
      <CampaignHistory campaigns={campaigns} onCampaignCancelled={fetchData} />
    </div>
  );
}
