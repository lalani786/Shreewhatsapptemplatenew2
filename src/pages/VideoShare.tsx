import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, Trash2, Upload, Video } from "lucide-react";

interface SharedVideo {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  video_url: string;
  storage_path: string | null;
  is_public: boolean;
  created_at: string;
}

const BUCKET = "whatsapp-media";
const MAX_BYTES = 50 * 1024 * 1024;

function makeSlug(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "video";
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function VideoShare() {
  const [videos, setVideos] = useState<SharedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadVideos = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setLoading(false);
    const { data, error } = await (supabase as any)
      .from("shared_videos")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setVideos((data ?? []) as SharedVideo[]);
    setLoading(false);
  };

  useEffect(() => {
    loadVideos();
  }, []);

  const shareLink = (slug: string) => `${window.location.origin}/v/${slug}`;

  const handleUpload = async () => {
    if (!file) return toast.error("Choose a video file first");
    if (!title.trim()) return toast.error("Add a title for the video");
    if (!file.type.startsWith("video/")) return toast.error("Only video files can be uploaded");
    if (file.size > MAX_BYTES) return toast.error("Video is larger than 50 MB");

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be signed in");

      const ext = file.name.split(".").pop()?.toLowerCase() || (file.type.includes("webm") ? "webm" : "mp4");
      const path = `shared-videos/${user.id}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || "video/mp4", upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const slug = makeSlug(title);

      const { error: insErr } = await (supabase as any).from("shared_videos").insert({
        user_id: user.id,
        slug,
        title: title.trim(),
        description: description.trim() || null,
        video_url: pub.publicUrl,
        storage_path: path,
        is_public: isPublic,
      });
      if (insErr) throw insErr;

      await navigator.clipboard.writeText(shareLink(slug)).catch(() => {});
      toast.success("Video uploaded — share link copied");
      setTitle("");
      setDescription("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      loadVideos();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const togglePublic = async (video: SharedVideo) => {
    const { error } = await (supabase as any)
      .from("shared_videos")
      .update({ is_public: !video.is_public })
      .eq("id", video.id);
    if (error) return toast.error(error.message);
    setVideos((v) => v.map((x) => (x.id === video.id ? { ...x, is_public: !x.is_public } : x)));
  };

  const remove = async (video: SharedVideo) => {
    const { error } = await (supabase as any).from("shared_videos").delete().eq("id", video.id);
    if (error) return toast.error(error.message);
    if (video.storage_path) await supabase.storage.from(BUCKET).remove([video.storage_path]);
    setVideos((v) => v.filter((x) => x.id !== video.id));
    toast.success("Video deleted");
  };

  const copy = async (slug: string) => {
    await navigator.clipboard.writeText(shareLink(slug));
    toast.success("Share link copied");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Video Share</h1>
        <p className="text-sm text-muted-foreground">
          Host promo videos and share them anywhere with a public link.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" /> Upload a video
          </CardTitle>
          <CardDescription>MP4 or WebM, up to 50 MB.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="video-title">Title</Label>
              <Input
                id="video-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Diwali promo video"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="video-file">Video file</Label>
              <Input
                id="video-file"
                ref={fileRef}
                type="file"
                accept="video/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="video-desc">Description (optional)</Label>
            <Textarea
              id="video-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown on the public share page"
              rows={3}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Public link</p>
              <p className="text-xs text-muted-foreground">
                Anyone with the link can watch when enabled.
              </p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
          <Button onClick={handleUpload} disabled={uploading} className="w-full md:w-auto">
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" /> Upload & create link
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" /> Shared videos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : videos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No videos yet. Upload one above to get a shareable link.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {videos.map((v) => (
                <div key={v.id} className="space-y-3 rounded-lg border border-border p-3">
                  <video src={v.video_url} controls className="aspect-video w-full rounded-md bg-muted" />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{v.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{shareLink(v.slug)}</p>
                    </div>
                    <Badge variant={v.is_public ? "default" : "secondary"}>
                      {v.is_public ? "Public" : "Private"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => copy(v.slug)}>
                      <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={shareLink(v.slug)} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
                      </a>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => togglePublic(v)}>
                      {v.is_public ? "Make private" : "Make public"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(v)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
