-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Public recordings are viewable by everyone" ON public.match_recordings;
DROP POLICY IF EXISTS "Users can view their own private recordings" ON public.match_recordings;

-- Create new policy: Anyone with the link can view any video
CREATE POLICY "Anyone with link can view recordings" 
ON public.match_recordings 
FOR SELECT 
USING (true);

-- Update increment views to work on any video (not just public)
DROP FUNCTION IF EXISTS public.increment_video_views(uuid);

CREATE OR REPLACE FUNCTION public.increment_video_views(video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE match_recordings 
  SET views = COALESCE(views, 0) + 1 
  WHERE id = video_id;
END;
$$;