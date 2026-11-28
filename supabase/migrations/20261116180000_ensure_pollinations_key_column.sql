-- Ensure pollinations_api_key column exists on api_credentials
ALTER TABLE public.api_credentials ADD COLUMN IF NOT EXISTS pollinations_api_key TEXT;

-- Ensure ai_api_keys table exists with proper unique constraint on user_id
CREATE TABLE IF NOT EXISTS public.ai_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  pollinations_api_key TEXT,
  stability_api_key TEXT,
  leonardo_api_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on ai_api_keys
ALTER TABLE public.ai_api_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_api_keys' AND policyname = 'Users can view their own ai_api_keys'
  ) THEN
    CREATE POLICY "Users can view their own ai_api_keys" ON public.ai_api_keys FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_api_keys' AND policyname = 'Users can insert their own ai_api_keys'
  ) THEN
    CREATE POLICY "Users can insert their own ai_api_keys" ON public.ai_api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_api_keys' AND policyname = 'Users can update their own ai_api_keys'
  ) THEN
    CREATE POLICY "Users can update their own ai_api_keys" ON public.ai_api_keys FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
