-- Ensure all AI image and video provider columns exist on public.api_credentials
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS pollinations_api_key TEXT;
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS nvidia_api_key TEXT;
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS stability_api_key TEXT;
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS leonardo_api_key TEXT;
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS pexels_api_key TEXT;
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS runway_api_key TEXT;
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS elevenlabs_api_key TEXT;
