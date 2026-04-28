
-- Update handle_new_user to also create Pokemon TCG profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  username_generated text;
  username_counter integer := 0;
BEGIN
  RAISE NOTICE 'Novo usuário criado: ID=%, Email=%', NEW.id, NEW.email;
  
  IF NEW.raw_user_meta_data->>'username' IS NOT NULL AND 
     NEW.raw_user_meta_data->>'username' != '' THEN
    username_generated := NEW.raw_user_meta_data->>'username';
    username_generated := regexp_replace(username_generated, '[^a-zA-Z0-9]', '', 'g');
    username_generated := lower(substring(username_generated from 1 for 17));
  ELSE
    username_generated := split_part(NEW.email, '@', 1);
    username_generated := regexp_replace(username_generated, '[^a-zA-Z0-9]', '', 'g');
    username_generated := lower(substring(username_generated from 1 for 17));
  END IF;
  
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = username_generated) LOOP
    username_counter := username_counter + 1;
    IF NEW.raw_user_meta_data->>'username' IS NOT NULL THEN
      username_generated := lower(substring(NEW.raw_user_meta_data->>'username' from 1 for 15)) || username_counter;
    ELSE
      username_generated := lower(substring(split_part(NEW.email, '@', 1) from 1 for 15)) || username_counter;
    END IF;
  END LOOP;

  INSERT INTO public.profiles (user_id, username, avatar_url)
  VALUES (
    NEW.id,
    username_generated,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || NEW.id::text)
  );

  -- Create default Yu-Gi-Oh! TCG profile
  INSERT INTO public.tcg_profiles (user_id, tcg_type, username, avatar_url)
  VALUES (
    NEW.id,
    'yugioh',
    username_generated,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || NEW.id::text)
  );

  -- Create default Pokemon TCG profile
  INSERT INTO public.tcg_profiles (user_id, tcg_type, username, avatar_url)
  VALUES (
    NEW.id,
    'pokemon',
    username_generated,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || NEW.id::text)
  );

  IF (SELECT COUNT(*) FROM public.profiles) = 1 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Erro ao criar perfil para user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;

-- Update matchmake function to support pokemon
CREATE OR REPLACE FUNCTION public.matchmake(p_match_type text, p_user_id uuid, p_tcg_type text DEFAULT 'yugioh'::text, p_max_players integer DEFAULT 2)
 RETURNS TABLE(duel_id uuid, player_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_waiting_entry RECORD;
  v_new_duel_id UUID;
  v_existing_duel RECORD;
  v_default_lp integer;
BEGIN
  DELETE FROM matchmaking_queue WHERE expires_at < NOW();
  
  -- Set default LP based on TCG type
  IF p_tcg_type = 'magic' THEN
    v_default_lp := 40;
  ELSIF p_tcg_type = 'pokemon' THEN
    v_default_lp := 6;
  ELSE
    v_default_lp := 8000;
  END IF;
  
  -- For 4-player games, first check if there's a duel waiting for more players
  IF p_max_players = 4 THEN
    SELECT ld.id INTO v_existing_duel
    FROM live_duels ld
    WHERE ld.max_players = 4
      AND ld.status = 'waiting'
      AND ld.tcg_type = p_tcg_type
      AND ld.creator_id != p_user_id
      AND (ld.opponent_id IS NULL OR ld.player3_id IS NULL OR ld.player4_id IS NULL)
      AND ld.opponent_id IS DISTINCT FROM p_user_id
      AND ld.player3_id IS DISTINCT FROM p_user_id
      AND ld.player4_id IS DISTINCT FROM p_user_id
    ORDER BY ld.created_at ASC
    LIMIT 1;

    IF v_existing_duel.id IS NOT NULL THEN
      IF (SELECT opponent_id FROM live_duels WHERE id = v_existing_duel.id) IS NULL THEN
        UPDATE live_duels SET opponent_id = p_user_id WHERE id = v_existing_duel.id;
      ELSIF (SELECT player3_id FROM live_duels WHERE id = v_existing_duel.id) IS NULL THEN
        UPDATE live_duels SET player3_id = p_user_id WHERE id = v_existing_duel.id;
      ELSE
        UPDATE live_duels SET player4_id = p_user_id WHERE id = v_existing_duel.id;
      END IF;

      INSERT INTO redirects (user_id, duel_id) VALUES (p_user_id, v_existing_duel.id);
      DELETE FROM matchmaking_queue WHERE user_id = p_user_id;
      
      RETURN QUERY SELECT v_existing_duel.id, 'matched'::TEXT;
      RETURN;
    END IF;
  END IF;
  
  -- Standard matchmaking
  SELECT * INTO v_waiting_entry
  FROM matchmaking_queue
  WHERE status = 'waiting'
    AND match_type = p_match_type
    AND tcg_type = p_tcg_type
    AND max_players = p_max_players
    AND user_id != p_user_id
  ORDER BY joined_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF FOUND THEN
    INSERT INTO live_duels (creator_id, opponent_id, is_ranked, tcg_type, max_players,
      player1_lp, player2_lp, player3_lp, player4_lp)
    VALUES (
      v_waiting_entry.user_id,
      p_user_id,
      p_match_type = 'ranked',
      p_tcg_type,
      p_max_players,
      v_default_lp, v_default_lp, v_default_lp, v_default_lp
    )
    RETURNING id INTO v_new_duel_id;
    
    INSERT INTO redirects (user_id, duel_id)
    VALUES 
      (v_waiting_entry.user_id, v_new_duel_id),
      (p_user_id, v_new_duel_id);
    
    DELETE FROM matchmaking_queue 
    WHERE user_id IN (v_waiting_entry.user_id, p_user_id);
    
    RETURN QUERY SELECT v_new_duel_id, 'matched'::TEXT;
  ELSE
    INSERT INTO matchmaking_queue (user_id, match_type, status, expires_at, tcg_type, max_players)
    VALUES (p_user_id, p_match_type, 'waiting', NOW() + INTERVAL '2 minutes', p_tcg_type, p_max_players)
    ON CONFLICT (user_id) 
    DO UPDATE SET 
      match_type = EXCLUDED.match_type,
      status = 'waiting',
      joined_at = NOW(),
      expires_at = NOW() + INTERVAL '2 minutes',
      tcg_type = EXCLUDED.tcg_type,
      max_players = EXCLUDED.max_players;
    
    RETURN QUERY SELECT NULL::UUID, 'waiting'::TEXT;
  END IF;
END;
$function$;
