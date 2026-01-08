-- Drop the existing view
DROP VIEW IF EXISTS public.public_profiles;

-- Recreate the view with SECURITY INVOKER (default, but explicit for clarity)
CREATE VIEW public.public_profiles 
WITH (security_invoker = true)
AS
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