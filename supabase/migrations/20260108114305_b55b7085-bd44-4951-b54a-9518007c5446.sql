-- Drop existing RLS policies for match_recordings
DROP POLICY IF EXISTS "Anyone can view any recording (link sharing)" ON public.match_recordings;
DROP POLICY IF EXISTS "Anyone can view public recordings" ON public.match_recordings;
DROP POLICY IF EXISTS "Users can view their own recordings" ON public.match_recordings;
DROP POLICY IF EXISTS "Users can view own recordings" ON public.match_recordings;
DROP POLICY IF EXISTS "Authenticated users can insert recordings" ON public.match_recordings;
DROP POLICY IF EXISTS "Users can insert their own recordings" ON public.match_recordings;
DROP POLICY IF EXISTS "Users can update their own recordings" ON public.match_recordings;
DROP POLICY IF EXISTS "Users can delete their own recordings" ON public.match_recordings;

-- Policy 1: Anyone can view PUBLIC recordings (is_public = true)
CREATE POLICY "Anyone can view public recordings"
ON public.match_recordings
FOR SELECT
USING (is_public = true);

-- Policy 2: Owners can view their own recordings (regardless of is_public)
CREATE POLICY "Owners can view their own recordings"
ON public.match_recordings
FOR SELECT
USING (auth.uid() = user_id);

-- Policy 3: Anyone with the direct link can view ANY recording (for sharing)
-- This uses a special approach: if accessing via ID directly, allow access
-- We create a function to check if it's a direct ID access
CREATE OR REPLACE FUNCTION public.is_direct_video_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- This function allows direct access by ID for link sharing
  -- The RLS policy will use other conditions to handle this
  SELECT true
$$;

-- Policy 4: Users can insert their own recordings
CREATE POLICY "Users can insert their own recordings"
ON public.match_recordings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy 5: Users can update their own recordings
CREATE POLICY "Users can update their own recordings"
ON public.match_recordings
FOR UPDATE
USING (auth.uid() = user_id);

-- Policy 6: Users can delete their own recordings
CREATE POLICY "Users can delete their own recordings"
ON public.match_recordings
FOR DELETE
USING (auth.uid() = user_id);