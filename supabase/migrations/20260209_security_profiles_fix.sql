-- Security Fix: Restrict profiles table access
-- Only allow users to view their own complete profile
-- Create public view with non-sensitive fields for leaderboards

-- ============================================================================
-- STEP 1: Drop the overly permissive SELECT policy
-- ============================================================================
DROP POLICY IF EXISTS "Public profiles viewable by all" ON public.profiles;

-- ============================================================================
-- STEP 2: Create secure SELECT policies for profiles
-- ============================================================================

-- Users can view their own complete profile
CREATE POLICY "Users view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all profiles
CREATE POLICY "Admins view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- ============================================================================
-- STEP 3: Create public leaderboard view with non-sensitive fields
-- ============================================================================
DROP VIEW IF EXISTS public.leaderboard;

CREATE VIEW public.leaderboard AS
SELECT
    user_id,
    username,
    avatar_url,
    account_type,
    level,
    points,
    wins,
    losses,
    draws,
    win_rate,
    duelcoins,
    created_at,
    last_seen_at
FROM public.profiles
WHERE account_type != 'banned'
ORDER BY points DESC;

-- Grant public read access to leaderboard view
GRANT SELECT ON public.leaderboard TO authenticated, anon;

-- ============================================================================
-- STEP 4: Create friend profiles view (limited info about friends)
-- ============================================================================
DROP VIEW IF EXISTS public.friend_profiles;

CREATE VIEW public.friend_profiles AS
SELECT
    p.user_id,
    p.username,
    p.avatar_url,
    p.account_type,
    p.level,
    p.is_online,
    p.last_seen_at
FROM public.profiles p
INNER JOIN public.friends f ON (
    (f.user_id = p.user_id AND f.friend_id = auth.uid()) OR
    (f.friend_id = p.user_id AND f.user_id = auth.uid())
);

-- Grant access to friend profiles
GRANT SELECT ON public.friend_profiles TO authenticated;

-- ============================================================================
-- STEP 5: Create function to get online status by ID
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_online_status;

CREATE OR REPLACE FUNCTION public.get_online_status(p_user_id uuid)
RETURNS TABLE (
    user_id uuid,
    username text,
    avatar_url text,
    is_online boolean,
    last_seen_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.user_id,
        p.username,
        p.avatar_url,
        p.is_online,
        p.last_seen_at
    FROM public.profiles p
    WHERE p.user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_online_status TO authenticated;

-- ============================================================================
-- STEP 6: Create public online users view
-- ============================================================================
DROP VIEW IF EXISTS public.online_users;

CREATE VIEW public.online_users AS
SELECT
    user_id,
    username,
    avatar_url,
    is_online
FROM public.profiles
WHERE is_online = true
AND account_type != 'banned';

GRANT SELECT ON public.online_users TO authenticated;

-- ============================================================================
-- Security: Add comments for documentation
-- ============================================================================
COMMENT ON TABLE public.profiles IS 'Contains user profile data. Access restricted: users can only view their own data. Use public.leaderboard view for leaderboard data.';
COMMENT ON VIEW public.leaderboard IS 'Public leaderboard with non-sensitive fields only. Safe for public access.';
COMMENT ON VIEW public.friend_profiles IS 'Limited profile info for friends only. Shows online status and basic info.';
COMMENT ON VIEW public.online_users IS 'List of currently online users. Safe for public access.';
