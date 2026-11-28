-- Migration: Create ai_video_generations table with company and user isolation
CREATE TABLE IF NOT EXISTS public.ai_video_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id TEXT,
    original_image_url TEXT NOT NULL,
    generated_video_url TEXT,
    video_prompt TEXT,
    provider TEXT NOT NULL,
    model TEXT,
    duration INTEGER DEFAULT 5,
    aspect_ratio TEXT DEFAULT '9:16',
    motion_style TEXT,
    camera_movement TEXT,
    generation_status TEXT NOT NULL DEFAULT 'completed', -- 'pending' | 'processing' | 'completed' | 'failed'
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_video_generations_user_id ON public.ai_video_generations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_video_generations_company_id ON public.ai_video_generations(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_video_generations_created_at ON public.ai_video_generations(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.ai_video_generations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own company video generations"
ON public.ai_video_generations FOR SELECT
USING (
    auth.uid() = user_id 
    OR (company_id IS NOT NULL AND company_id = (auth.jwt() ->> 'company_id'))
);

CREATE POLICY "Users can insert their own video generations"
ON public.ai_video_generations FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own video generations"
ON public.ai_video_generations FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own video generations"
ON public.ai_video_generations FOR DELETE
USING (auth.uid() = user_id);
