import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio, Clock, Sparkles, Loader2 } from "lucide-react";

type FeedItem = {
  id: string;
  kind: "template" | "post";
  title: string;
  body: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  status?: string;
  platform?: string;
  at: string;
};

const isVideo = (url?: string | null, type?: string | null) =>
  !!url && (type?.includes("video") || /\.(mp4|webm|mov)(\?|$)/i.test(url));

export function LiveFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [{ data: tpls }, { data: posts }] = await Promise.all([
      supabase.from("templates").select("*").order("created_at", { ascending: false }).limit(20),
      supabase
        .from("social_media_posts")
        .select("*")
        .in("status", ["scheduled", "pending", "processing", "queued"])
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    const feed: FeedItem[] = [
      ...(tpls || []).map((t) => ({
        id: t.id, kind: "template" as const, title: t.name, body: t.content,
        status: t.category || "template", at: t.created_at,
      })),
      ...(posts || []).map((p) => ({
        id: p.id, kind: "post" as const, title: `${p.platform} post`, body: p.content || "",
        mediaUrl: p.media_url, mediaType: p.media_type, status: p.status, platform: p.platform,
        at: p.scheduled_for || p.created_at || "",
      })),
    ].sort((a, b) => +new Date(b.at) - +new Date(a.at));
    setItems(feed);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("social-live-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "templates" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "social_media_posts" }, load)
      .subscribe();
    const t = setInterval(load, 30000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary animate-pulse" /> Live Feed
        </CardTitle>
        <CardDescription>Generated templates and scheduled posts, updated in real time</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : items.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">Nothing here yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((it) => (
              <div key={it.kind + it.id} className="rounded-lg border bg-card overflow-hidden">
                <div className="aspect-video bg-muted flex items-center justify-center">
                  {isVideo(it.mediaUrl, it.mediaType) ? (
                    <video src={it.mediaUrl!} className="h-full w-full object-cover" muted loop autoPlay playsInline controls />
                  ) : it.mediaUrl ? (
                    <img src={it.mediaUrl} alt={it.title} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Sparkles className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate capitalize">{it.title}</span>
                    <Badge variant={it.kind === "post" ? "default" : "secondary"}>
                      {it.kind === "post" ? it.status : "Template"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-line">{it.body}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {it.at ? new Date(it.at).toLocaleString() : "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
