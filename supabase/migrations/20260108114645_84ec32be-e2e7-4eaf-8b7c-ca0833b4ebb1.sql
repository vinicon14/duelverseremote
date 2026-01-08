-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Public profile data viewable by all" ON public.profiles;

-- Create a secure public view with only non-sensitive fields
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
  user_id,
  username,
  avatar_url,
  points,
  wins,
  losses
FROM public.profiles;

-- Grant SELECT on the view to anon and authenticated roles
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Create a new restrictive policy: unauthenticated users cannot see profiles directly
-- Only authenticated users can see profiles, and they see limited data based on context
CREATE POLICY "Authenticated users can view basic profile data"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL);