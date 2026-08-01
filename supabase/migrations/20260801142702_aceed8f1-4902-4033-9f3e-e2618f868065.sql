CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_base     text;
  v_username text;
  v_country  text;
  v_language text;
  v_try      int := 0;
BEGIN
  v_base := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'username'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'duelist'
  );

  -- keep only safe characters
  v_base := regexp_replace(v_base, '[^A-Za-z0-9_\-\.]', '', 'g');
  IF char_length(v_base) < 3 THEN
    v_base := 'duelist' || substr(replace(NEW.id::text, '-', ''), 1, 6);
  END IF;
  IF char_length(v_base) > 20 THEN
    v_base := substr(v_base, 1, 20);
  END IF;

  v_username := v_base;
  WHILE EXISTS (SELECT 1 FROM public.profiles p WHERE p.username = v_username) LOOP
    v_try := v_try + 1;
    IF v_try > 50 THEN
      v_username := substr('duelist' || replace(NEW.id::text, '-', ''), 1, 20);
      EXIT;
    END IF;
    v_username := substr(v_base, 1, 20 - char_length(v_try::text) - 1) || '_' || v_try::text;
  END LOOP;

  v_country  := NULLIF(NEW.raw_user_meta_data ->> 'country_code', '');
  v_language := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'language_code', ''), 'en');

  INSERT INTO public.profiles (user_id, username, country_code, language_code)
  VALUES (NEW.id, v_username, v_country, v_language)
  ON CONFLICT (user_id) DO UPDATE
    SET country_code  = COALESCE(EXCLUDED.country_code, public.profiles.country_code),
        language_code = COALESCE(EXCLUDED.language_code, public.profiles.language_code);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- never block account creation because of profile setup
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;