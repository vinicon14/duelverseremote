-- Create table for match recordings
CREATE TABLE IF NOT EXISTS public.match_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  duel_id UUID REFERENCES public.live_duels(id) ON DELETE CASCADE,
  tournament_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration INTEGER,
  file_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  views INTEGER DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.match_recordings ENABLE ROW LEVEL SECURITY;

-- Allow users to view all recordings
CREATE POLICY "Recordings are viewable by everyone"
  ON public.match_recordings
  FOR SELECT
  USING (true);

-- Allow users to insert their own recordings
CREATE POLICY "Users can create their own recordings"
  ON public.match_recordings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own recordings
CREATE POLICY "Users can update their own recordings"
  ON public.match_recordings
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Allow users to delete their own recordings
CREATE POLICY "Users can delete their own recordings"
  ON public.match_recordings
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create storage bucket for recordings
INSERT INTO storage.buckets (id, name, public)
VALUES ('match-recordings', 'match-recordings', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for recordings
CREATE POLICY "Recordings are publicly accessible"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'match-recordings');

CREATE POLICY "Users can upload their own recordings"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'match-recordings' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own recordings"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'match-recordings' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own recordings"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'match-recordings' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Create index for faster queries
CREATE INDEX idx_match_recordings_user_id ON public.match_recordings(user_id);
CREATE INDEX idx_match_recordings_created_at ON public.match_recordings(created_at DESC);