import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  Share2,
  Send,
  Instagram,
  Facebook,
  Youtube,
  Linkedin,
  Twitter,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Image as ImageIcon,
  Check,
} from "lucide-react";

interface DirectSocialPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContent?: string;
  initialImageUrl?: string;
  templateName?: string;
}

const SOCIAL_PLATFORMS = [
  {
    id: "instagram",
    label: "Instagram",
    icon: Instagram,
    badgeClass: "bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 text-white border-transparent",
    maxChars: 2200,
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: Facebook,
    badgeClass: "bg-blue-600 text-white border-transparent",
    maxChars: 63206,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: Linkedin,
    badgeClass: "bg-blue-700 text-white border-transparent",
    maxChars: 3000,
  },
  {
    id: "x",
    label: "X (Twitter)",
    icon: Twitter,
    badgeClass: "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 border-transparent",
    maxChars: 280,
  },
  {
    id: "youtube",
    label: "YouTube Community",
    icon: Youtube,
    badgeClass: "bg-red-600 text-white border-transparent",
    maxChars: 5000,
  },
];

export default function DirectSocialPostDialog({
  open,
  onOpenChange,
  initialContent = "",
  initialImageUrl = "",
  templateName,
}: DirectSocialPostDialogProps) {
  const navigate = useNavigate();
  const [content, setContent] = useState(initialContent);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram", "facebook"]);
  const [includeImage, setIncludeImage] = useState(Boolean(initialImageUrl));
  const [isPosting, setIsPosting] = useState(false);
  const [configuredPlatforms, setConfiguredPlatforms] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setContent(initialContent);
      setIncludeImage(Boolean(initialImageUrl));
      checkConfiguredCredentials();
    }
  }, [open, initialContent, initialImageUrl]);

  const checkConfiguredCredentials = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("social_media_credentials")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setConfiguredPlatforms({
          facebook: Boolean(data.facebook_page_id && data.facebook_page_access_token),
          instagram: Boolean(data.instagram_business_account_id && (data.instagram_access_token || data.facebook_page_access_token)),
          linkedin: false, // LinkedIn often uses direct OAuth or backend secret
          x: Boolean(data.x_api_key && data.x_access_token),
          youtube: Boolean(data.youtube_channel_id && data.youtube_access_token),
        });
      }
    } catch {
      // ignore
    }
  };

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    setSelectedPlatforms(SOCIAL_PLATFORMS.map((p) => p.id));
  };

  const clearAll = () => {
    setSelectedPlatforms([]);
  };

  const uploadBase64Image = async (dataUrl: string, userId: string): Promise<string> => {
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) throw new Error("Invalid base64 image data");

    const mimeType = matches[1];
    const base64Content = matches[2];
    const binary = atob(base64Content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const ext = mimeType.split("/")[1] || "png";
    const fileName = `${userId}/social/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("whatsapp-media")
      .upload(fileName, bytes, { contentType: mimeType, upsert: false });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from("whatsapp-media")
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  };

  const handleDirectPost = async () => {
    if (!content.trim()) {
      toast.error("Please enter caption / message content");
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast.error("Please select at least one social media platform");
      return;
    }

    setIsPosting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in to post to social media");
        setIsPosting(false);
        return;
      }

      let uploadedMediaUrl: string | null = null;
      if (includeImage && initialImageUrl) {
        if (initialImageUrl.startsWith("data:")) {
          toast.info("Uploading image to storage...");
          uploadedMediaUrl = await uploadBase64Image(initialImageUrl, user.id);
        } else {
          uploadedMediaUrl = initialImageUrl;
        }
      }

      // 1. Insert records into social_media_posts
      const postRecords = selectedPlatforms.map((platform) => ({
        user_id: user.id,
        platform,
        content: content.trim(),
        media_url: uploadedMediaUrl,
        media_type: uploadedMediaUrl ? "image" : null,
        post_type: uploadedMediaUrl ? "image" : "text",
        status: "pending",
      }));

      const { error: insertError } = await supabase
        .from("social_media_posts")
        .insert(postRecords);

      if (insertError) throw insertError;

      // 2. Invoke the edge function post-to-social
      const { data, error: functionError } = await supabase.functions.invoke("post-to-social", {
        body: {
          platforms: selectedPlatforms,
          content: content.trim(),
          mediaUrl: uploadedMediaUrl,
        },
      });

      if (functionError) {
        console.warn("Direct post edge function warning:", functionError);
        toast.warning(
          "Post saved to database. Auto-posting requires platform credentials in API Setup.",
          { duration: 5000 },
        );
      } else if (data?.results) {
        const succeeded = data.results.filter((r: any) => r.success).length;
        const failed = data.results.filter((r: any) => !r.success).length;

        if (failed === 0) {
          toast.success(`Published to ${succeeded} platform${succeeded > 1 ? "s" : ""} successfully!`);
          onOpenChange(false);
        } else if (succeeded > 0) {
          toast.warning(`Published to ${succeeded} platform(s), ${failed} failed. Check API Setup credentials.`);
          onOpenChange(false);
        } else {
          const firstErr = data.results[0]?.error || "Could not publish to platform(s)";
          toast.error("Publishing failed", { description: `${firstErr}. Configure credentials in API Setup.` });
        }
      } else {
        toast.success("Posts queued successfully!");
        onOpenChange(false);
      }
    } catch (err: any) {
      console.error("Direct post error:", err);
      toast.error(err?.message || "Failed to post to social media");
    } finally {
      setIsPosting(false);
    }
  };

  const handleOpenInStudio = () => {
    onOpenChange(false);
    navigate("/social-media", {
      state: {
        content,
        mediaUrl: includeImage ? initialImageUrl : null,
        platforms: selectedPlatforms,
      },
    });
  };

  const exceedsTwitterLimit = selectedPlatforms.includes("x") && content.length > 280;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Share2 className="h-5 w-5 text-primary" />
            Direct Social Media Post
          </DialogTitle>
          <DialogDescription>
            Publish your AI-generated marketing copy and visual directly to your social platforms.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Platforms Picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Select Target Platforms</Label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-primary hover:underline font-medium"
                >
                  Select All
                </button>
                <span className="text-muted-foreground">•</span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-muted-foreground hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {SOCIAL_PLATFORMS.map(({ id, label, icon: Icon, badgeClass }) => {
                const isSelected = selectedPlatforms.includes(id);
                const isConfigured = configuredPlatforms[id];

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => togglePlatform(id)}
                    className={`flex items-center gap-2.5 p-3 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border hover:border-primary/40 bg-card"
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${badgeClass}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold leading-tight truncate">
                        {label}
                      </div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        {isConfigured ? (
                          <span className="text-emerald-500 flex items-center gap-0.5">
                            <Check className="h-3 w-3" /> Ready
                          </span>
                        ) : (
                          <span>Standard API</span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Post Caption / Content */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="post-content" className="text-sm font-semibold">
                Post Caption / Message
              </Label>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-mono ${
                    exceedsTwitterLimit ? "text-destructive font-bold" : "text-muted-foreground"
                  }`}
                >
                  {content.length} chars
                  {selectedPlatforms.includes("x") && " (X: max 280)"}
                </span>
              </div>
            </div>

            <Textarea
              id="post-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="Write your post caption..."
              className="resize-y font-sans text-sm"
            />

            {exceedsTwitterLimit && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Your post exceeds X (Twitter)'s 280-character limit. You can shorten it or uncheck X.
              </p>
            )}
          </div>

          {/* Media Attachment */}
          {initialImageUrl ? (
            <div className="rounded-lg border p-3.5 bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-primary" />
                  <Label htmlFor="attach-image" className="text-sm font-medium cursor-pointer">
                    Attach Generated AI Image
                  </Label>
                </div>
                <Switch
                  id="attach-image"
                  checked={includeImage}
                  onCheckedChange={setIncludeImage}
                />
              </div>

              {includeImage && (
                <div className="flex items-center gap-3 pt-1">
                  <img
                    src={initialImageUrl}
                    alt="Post preview"
                    className="h-20 w-20 rounded-md object-cover border shadow-sm"
                  />
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="font-medium text-foreground flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-amber-500" />
                      AI Marketing Visual Attached
                    </div>
                    <p>Will be posted alongside your message to image-supported platforms.</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
              Tip: Generate an image in the AI Template tab to automatically attach high-res marketing visuals here.
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-3 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handleOpenInStudio}
            className="sm:mr-auto flex items-center gap-1.5"
          >
            <ExternalLink className="h-4 w-4" />
            Open in Studio
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPosting}
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleDirectPost}
            disabled={isPosting || selectedPlatforms.length === 0 || !content.trim()}
            className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white min-w-[140px] shadow-md"
          >
            {isPosting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Direct Post ({selectedPlatforms.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
