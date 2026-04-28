
-- Update matchmake function to filter by tcg_type
CREATE OR REPLACE FUNCTION public.matchmake(p_match_type text, p_user_id uuid, p_tcg_type text DEFAULT 'yugioh')
 RETURNS TABLE(duel_id uuid, player_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_waiting_entry RECORD;
  v_new_duel_id UUID;
BEGIN
  DELETE FROM matchmaking_queue WHERE expires_at < NOW();
  
  SELECT * INTO v_waiting_entry
  FROM matchmaking_queue
  WHERE status = 'waiting'
    AND match_type = p_match_type
    AND tcg_type = p_tcg_type
    AND user_id != p_user_id
  ORDER BY joined_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF FOUND THEN
    INSERT INTO live_duels (creator_id, opponent_id, status, is_ranked, tcg_type)
    VALUES (
      v_waiting_entry.user_id,
      p_user_id,
      'waiting',
      p_match_type = 'ranked',
      p_tcg_type
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
    INSERT INTO matchmaking_queue (user_id, match_type, status, expires_at, tcg_type)
    VALUES (p_user_id, p_match_type, 'waiting', NOW() + INTERVAL '2 minutes', p_tcg_type)
    ON CONFLICT (user_id) 
    DO UPDATE SET 
      match_type = EXCLUDED.match_type,
      status = 'waiting',
      joined_at = NOW(),
      expires_at = NOW() + INTERVAL '2 minutes',
      tcg_type = EXCLUDED.tcg_type;
    
    RETURN QUERY SELECT NULL::UUID, 'waiting'::TEXT;
  END IF;
END;
$function$;

-- Update handle_new_user to also create a tcg_profile
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

  -- Also create default Yu-Gi-Oh! TCG profile
  INSERT INTO public.tcg_profiles (user_id, tcg_type, username, avatar_url)
  VALUES (
    NEW.id,
    'yugioh',
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
