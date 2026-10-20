CREATE TABLE public.shared_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  storage_path TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_videos TO authenticated;
GRANT SELECT ON public.shared_videos TO anon;
GRANT ALL ON public.shared_videos TO service_role;

ALTER TABLE public.shared_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their shared videos"
ON public.shared_videos FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can view public shared videos"
ON public.shared_videos FOR SELECT TO anon, authenticated
USING (is_public = true);

CREATE INDEX idx_shared_videos_user ON public.shared_videos(user_id);

CREATE OR REPLACE FUNCTION public.increment_shared_video_views(_slug TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.shared_videos SET view_count = view_count + 1 WHERE slug = _slug AND is_public = true;
$$;

GRANT EXECUTE ON FUNCTION public.increment_shared_video_views(TEXT) TO anon, authenticated;