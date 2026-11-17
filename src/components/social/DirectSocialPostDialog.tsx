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
  Video as VideoIcon,
  Check,
  Film,
} from "lucide-react";

export type PostMediaType = "image" | "video";

interface DirectSocialPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContent?: string;
  initialImageUrl?: string;
  initialVideoUrl?: string;
  initialMediaType?: PostMediaType;
  templateName?: string;
}

const SOCIAL_PLATFORMS = [
  {
    id: "instagram",
    label: "Instagram",
    icon: Instagram,
    badgeClass: "bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 text-white border-transparent",
    maxChars: 2200,
    supportsVideo: true,
    supportsImage: true,
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: Facebook,
    badgeClass: "bg-blue-600 text-white border-transparent",
    maxChars: 63206,
    supportsVideo: true,
    supportsImage: true,
  },
  {
    id: "youtube",
    label: "YouTube Community / Video",
    icon: Youtube,
    badgeClass: "bg-red-600 text-white border-transparent",
    maxChars: 5000,
    supportsVideo: true,
    supportsImage: false, // YouTube only supports video
  },
  {
    id: "x",
    label: "X (Twitter)",
    icon: Twitter,
    badgeClass: "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 border-transparent",
    maxChars: 280,
    supportsVideo: true,
    supportsImage: true,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: Linkedin,
    badgeClass: "bg-blue-700 text-white border-transparent",
    maxChars: 3000,
    supportsVideo: true,
    supportsImage: true,
  },
];

export default function DirectSocialPostDialog({
  open,
  onOpenChange,
  initialContent = "",
  initialImageUrl = "",
  initialVideoUrl = "",
  initialMediaType = "image",
  templateName,
}: DirectSocialPostDialogProps) {
  const navigate = useNavigate();
  const [content, setContent] = useState(initialContent);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram", "facebook"]);
  const [selectedMediaType, setSelectedMediaType] = useState<PostMediaType>("image");
  const [includeMedia, setIncludeMedia] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [configuredPlatforms, setConfiguredPlatforms] = useState<Record<string, boolean>>({});

  const hasImage = Boolean(initialImageUrl && initialImageUrl.trim());
  const hasVideo = Boolean(initialVideoUrl && initialVideoUrl.trim());

  useEffect(() => {
    if (open) {
      setContent(initialContent);

      // Determine initial active media type based on available media and clicked action
      if (initialMediaType === "video" && hasVideo) {
        setSelectedMediaType("video");
        setIncludeMedia(true);
      } else if (initialMediaType === "image" && hasImage) {
        setSelectedMediaType("image");
        setIncludeMedia(true);
      } else if (hasVideo && !hasImage) {
        setSelectedMediaType("video");
        setIncludeMedia(true);
      } else if (hasImage && !hasVideo) {
        setSelectedMediaType("image");
        setIncludeMedia(true);
      } else if (hasVideo && hasImage) {
        setSelectedMediaType(initialMediaType || "video");
        setIncludeMedia(true);
      } else {
        setIncludeMedia(false);
      }

      checkConfiguredCredentials();
    }
  }, [open, initialContent, initialImageUrl, initialVideoUrl, initialMediaType, hasImage, hasVideo]);

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
    if (id === "youtube" && includeMedia && selectedMediaType === "image") {
      toast.info("YouTube only supports video uploads. Switch to 'Video Post' above to publish to YouTube.");
    }
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

  /**
   * Uploads base64 or blob media to Supabase storage with correct MIME type and extension.
   * If upload fails, throws an error and NEVER silently falls back to another media type.
   */
  const uploadMediaToStorage = async (
    sourceUrl: string,
    mediaKind: PostMediaType,
    userId: string
  ): Promise<string> => {
    // If it's already an absolute public HTTP URL, use it directly
    if (sourceUrl.startsWith("https://") || sourceUrl.startsWith("http://")) {
      return sourceUrl;
    }

    try {
      let blob: Blob;
      if (sourceUrl.startsWith("data:")) {
        const matches = sourceUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) throw new Error("Invalid base64 media data");
        const mimeType = matches[1];
        const base64Content = matches[2];
        const binary = atob(base64Content);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: mimeType });
      } else {
        const res = await fetch(sourceUrl);
        if (!res.ok) throw new Error(`Could not read local media blob (HTTP ${res.status})`);
        blob = await res.blob();
      }

      const isVideo = mediaKind === "video" || blob.type.startsWith("video/");
      const ext = isVideo ? "mp4" : blob.type.includes("jpeg") ? "jpg" : "png";
      const contentType = isVideo ? "video/mp4" : blob.type || "image/png";
      const fileName = `${userId}/social/${mediaKind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("whatsapp-media")
        .upload(fileName, blob, {
          contentType,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Upload error: ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from("whatsapp-media")
        .getPublicUrl(fileName);

      if (!publicUrlData?.publicUrl) {
        throw new Error("Could not retrieve public URL for uploaded media file");
      }

      return publicUrlData.publicUrl;
    } catch (err: any) {
      console.error(`Error uploading ${mediaKind} to storage:`, err);
      throw new Error(`Failed to upload ${mediaKind} to cloud storage: ${err.message || String(err)}`);
    }
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

    // Platform validation: YouTube requires video
    if (selectedPlatforms.includes("youtube") && (!includeMedia || selectedMediaType !== "video")) {
      toast.error("YouTube only supports video uploads. Please switch to Video Post or uncheck YouTube.");
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
      const activeMediaType = includeMedia ? selectedMediaType : null;

      if (includeMedia) {
        const sourceToUpload = selectedMediaType === "video" ? initialVideoUrl : initialImageUrl;
        if (!sourceToUpload) {
          throw new Error(`No ${selectedMediaType} source available to upload`);
        }

        toast.info(`Uploading ${selectedMediaType === "video" ? "MP4 video" : "image"} to cloud storage...`);
        uploadedMediaUrl = await uploadMediaToStorage(sourceToUpload, selectedMediaType, user.id);
      }

      // 1. Insert records into social_media_posts
      const postRecords = selectedPlatforms.map((platform) => ({
        user_id: user.id,
        platform,
        content: content.trim(),
        media_url: uploadedMediaUrl,
        media_type: activeMediaType,
        post_type: activeMediaType || "text",
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
          mediaType: activeMediaType,
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
          toast.success(
            `Published ${activeMediaType === "video" ? "Video" : "Post"} to ${succeeded} platform${succeeded > 1 ? "s" : ""} successfully!`
          );
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
    const mediaUrlToPass = includeMedia
      ? (selectedMediaType === "video" ? initialVideoUrl : initialImageUrl)
      : null;

    navigate("/social-media", {
      state: {
        content,
        mediaUrl: mediaUrlToPass || null,
        imageUrl: initialImageUrl || null,
        videoUrl: initialVideoUrl || null,
        mediaType: includeMedia ? selectedMediaType : null,
        selectedMediaType: includeMedia ? selectedMediaType : null,
        platforms: selectedPlatforms,
      },
    });
  };

  const exceedsTwitterLimit = selectedPlatforms.includes("x") && content.length > 280;
  const youtubeWarning = selectedPlatforms.includes("youtube") && (!includeMedia || selectedMediaType !== "video");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Share2 className="h-5 w-5 text-primary" />
            Direct Social Media Post
          </DialogTitle>
          <DialogDescription>
            Publish your AI-generated marketing copy, visual poster, or animated promotional video directly to social platforms.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Media Selection Options (Image Post vs Video Post) */}
          {(hasImage || hasVideo) && (
            <div className="rounded-lg border p-3.5 bg-muted/30 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    {selectedMediaType === "video" ? (
                      <VideoIcon className="h-4 w-4 text-purple-600" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-blue-600" />
                    )}
                    Select Post Media Type
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Choose whether to post the AI poster image or the animated video
                  </p>
                </div>

                {/* Two Clear Options: Image Post and Video Post */}
                <div className="flex items-center gap-1.5 p-1 bg-background rounded-lg border shadow-sm">
                  <button
                    type="button"
                    onClick={() => {
                      if (!hasImage) {
                        toast.info("No poster image generated yet. Generate a poster frame first.");
                        return;
                      }
                      setSelectedMediaType("image");
                      setIncludeMedia(true);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      selectedMediaType === "image" && includeMedia
                        ? "bg-blue-600 text-white shadow-sm font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    } ${!hasImage ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Image Post
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!hasVideo) {
                        toast.info("No video generated yet. Generate a promo video first.");
                        return;
                      }
                      setSelectedMediaType("video");
                      setIncludeMedia(true);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      selectedMediaType === "video" && includeMedia
                        ? "bg-purple-600 text-white shadow-sm font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    } ${!hasVideo ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <VideoIcon className="h-3.5 w-3.5" />
                    Video Post (MP4)
                  </button>
                </div>
              </div>

              {/* Attach Media Switch */}
              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Attach media to post ({selectedMediaType === "video" ? "MP4 Video" : "Poster Image"})
                  </span>
                </div>
                <Switch
                  id="include-media"
                  checked={includeMedia}
                  onCheckedChange={setIncludeMedia}
                />
              </div>

              {/* Media Preview Area */}
              {includeMedia && (
                <div className="pt-2">
                  {selectedMediaType === "video" && hasVideo ? (
                    <div className="space-y-2">
                      <div className="overflow-hidden rounded-md border bg-black flex items-center justify-center max-h-56">
                        <video
                          src={initialVideoUrl}
                          controls
                          playsInline
                          className="max-h-56 w-full object-contain"
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400 font-medium">
                          <Film className="h-3.5 w-3.5" />
                          Animated MP4 Video Attached
                        </span>
                        <span>Compatible with Instagram Reels, Facebook, YouTube, X</span>
                      </div>
                    </div>
                  ) : selectedMediaType === "image" && hasImage ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={initialImageUrl}
                        alt="Post preview"
                        className="h-24 w-24 rounded-md object-cover border shadow-sm shrink-0"
                      />
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="font-medium text-foreground flex items-center gap-1 text-blue-600 dark:text-blue-400">
                          <Sparkles className="h-3.5 w-3.5" />
                          High-Definition AI Poster Attached
                        </div>
                        <p>Will be published as an image post to supported social networks.</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

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
              {SOCIAL_PLATFORMS.map(({ id, label, icon: Icon, badgeClass, supportsImage }) => {
                const isSelected = selectedPlatforms.includes(id);
                const isConfigured = configuredPlatforms[id];
                const isYouTubeImageMismatch = id === "youtube" && includeMedia && selectedMediaType === "image";

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
                      <div className="text-xs font-semibold leading-tight truncate flex items-center gap-1">
                        {label}
                        {!supportsImage && (
                          <span className="text-[9px] text-red-500 font-normal">Video only</span>
                        )}
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

            {youtubeWarning && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 pt-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                YouTube only supports video uploads. Switch to "Video Post" above to upload your video to YouTube.
              </p>
            )}
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
              rows={5}
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
            className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white min-w-[150px] shadow-md"
          >
            {isPosting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Publish {includeMedia ? (selectedMediaType === "video" ? "Video" : "Image") : "Post"} ({selectedPlatforms.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
