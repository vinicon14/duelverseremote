
-- Update get_leaderboard to use profiles avatar_url as fallback for tcg_profiles
CREATE OR REPLACE FUNCTION public.get_leaderboard(limit_count integer DEFAULT 50, p_tcg_type text DEFAULT 'yugioh'::text)
 RETURNS TABLE(user_id uuid, username text, avatar_url text, wins integer, losses integer, points integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    tp.user_id,
    tp.username,
    COALESCE(tp.avatar_url, p.avatar_url) as avatar_url,
    tp.wins,
    tp.losses,
    tp.points
  FROM public.tcg_profiles tp
  LEFT JOIN public.profiles p ON p.user_id = tp.user_id
  WHERE tp.tcg_type = p_tcg_type
  ORDER BY tp.points DESC, tp.wins DESC
  LIMIT limit_count;
$function$;
