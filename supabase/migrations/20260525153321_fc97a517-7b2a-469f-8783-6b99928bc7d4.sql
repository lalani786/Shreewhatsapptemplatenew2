ALTER TABLE public.social_media_posts
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

CREATE INDEX IF NOT EXISTS idx_social_media_posts_schedule
  ON public.social_media_posts (platform, status, scheduled_for);