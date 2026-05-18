
CREATE OR REPLACE FUNCTION public.place_ranked_bet(
  p_tcg_type text,
  p_difficulty text,
  p_xp_bet integer,
  p_duel_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tcg text := COALESCE(NULLIF(lower(p_tcg_type), ''), 'yugioh');
  v_required_bet integer;
  v_current_xp integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_required_bet := CASE lower(COALESCE(p_difficulty, ''))
    WHEN 'easy' THEN 5
    WHEN 'medium' THEN 20
    WHEN 'hard' THEN 30
    WHEN 'extreme' THEN 50
    WHEN 'insane' THEN 1000
    ELSE GREATEST(COALESCE(p_xp_bet, 5), 1)
  END;

  -- Ensure a tcg_profiles row exists for this user/tcg
  INSERT INTO public.tcg_profiles (user_id, tcg_type, username)
  SELECT v_user_id, v_tcg, COALESCE(p.username, 'Player')
  FROM public.profiles p
  WHERE p.user_id = v_user_id
  ON CONFLICT (user_id, tcg_type) DO NOTHING;

  SELECT xp_total INTO v_current_xp
  FROM public.tcg_profiles
  WHERE user_id = v_user_id AND tcg_type = v_tcg
  FOR UPDATE;

  IF v_current_xp IS NULL THEN
    v_current_xp := 0;
  END IF;

  IF v_current_xp < v_required_bet THEN
    RETURN jsonb_build_object('success', false, 'message', 'XP insuficiente para esta dificuldade');
  END IF;

  UPDATE public.tcg_profiles
  SET xp_total = xp_total - v_required_bet,
      updated_at = now()
  WHERE user_id = v_user_id AND tcg_type = v_tcg;

  RETURN jsonb_build_object(
    'success', true,
    'xp_bet', v_required_bet,
    'difficulty', p_difficulty,
    'message', 'Aposta realizada!'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.place_ranked_bet(text, text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_ranked_bet(text, text, integer, uuid) TO authenticated;
