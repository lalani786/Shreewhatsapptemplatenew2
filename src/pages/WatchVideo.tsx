import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Copy, Loader2, MessageSquare } from "lucide-react";

interface PublicVideo {
  title: string;
  description: string | null;
  video_url: string;
}

export default function WatchVideo() {
  const { slug } = useParams<{ slug: string }>();
  const [video, setVideo] = useState<PublicVideo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await (supabase as any)
        .from("shared_videos")
        .select("title, description, video_url")
        .eq("slug", slug)
        .eq("is_public", true)
        .maybeSingle();
      setVideo((data as PublicVideo) ?? null);
      setLoading(false);
    };
    load();
  }, [slug]);

  useEffect(() => {
    if (video) document.title = `${video.title} | Shree WhatsApp`;
  }, [video]);

  const copy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <MessageSquare className="h-4 w-4" />
        </div>
        <span className="font-semibold">Shree WhatsApp</span>
      </header>

      <main className="mx-auto max-w-3xl p-4 md:p-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !video ? (
          <div className="py-20 text-center">
            <h1 className="text-xl font-semibold">Video not available</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This link is invalid or the video is no longer shared publicly.
            </p>
          </div>
        ) : (
          <Card>
            <CardContent className="space-y-4 p-4">
              <video
                src={video.video_url}
                controls
                autoPlay
                playsInline
                className="w-full rounded-lg bg-muted"
              />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold">{video.title}</h1>
                  {video.description && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {video.description}
                    </p>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={copy}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Share
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
