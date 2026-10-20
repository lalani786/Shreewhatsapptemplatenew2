
-- Add columns for image generation API keys to api_credentials table
ALTER TABLE public.api_credentials
ADD COLUMN IF NOT EXISTS stability_api_key TEXT,
ADD COLUMN IF NOT EXISTS fal_key TEXT,
ADD COLUMN IF NOT EXISTS leonardo_api_key TEXT;
