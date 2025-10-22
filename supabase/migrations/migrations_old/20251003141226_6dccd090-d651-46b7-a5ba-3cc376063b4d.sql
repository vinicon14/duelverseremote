-- Criar perfis para usuários existentes que não têm perfil
INSERT INTO public.profiles (
  user_id,
  username,
  display_name,
  elo_rating,
  level,
  coins,
  experience_points,
  wins,
  losses,
  draws,
  total_games,
  win_streak,
  best_win_streak
)
SELECT 
  au.id,
  COALESCE(au.raw_user_meta_data->>'username', 'Player_' || substring(au.id::text from 1 for 8)),
  COALESCE(au.raw_user_meta_data->>'display_name', 'New Player'),
  1500,
  1,
  100,
  0,
  0,
  0,
  0,
  0,
  0,
  0
FROM auth.users au
LEFT JOIN public.profiles p ON p.user_id = au.id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;