-- Add runway_api_key column to api_credentials table
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS runway_api_key TEXT;
