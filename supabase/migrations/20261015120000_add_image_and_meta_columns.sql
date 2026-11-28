-- Ensure all AI image providers, video providers, and Meta configuration columns exist on api_credentials
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS stability_api_key TEXT;
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS leonardo_api_key TEXT;
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS elevenlabs_api_key TEXT;
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS nvidia_api_key TEXT;
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS pexels_api_key TEXT;
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS meta_app_id TEXT;
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS whatsapp_business_account_id TEXT;
