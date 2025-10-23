-- Atualizar função handle_new_user para usar username dos metadados
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  username_generated text;
  username_counter integer := 0;
BEGIN
  -- Tentar usar o username fornecido nos metadados
  IF NEW.raw_user_meta_data->>'username' IS NOT NULL AND 
     NEW.raw_user_meta_data->>'username' != '' THEN
    username_generated := NEW.raw_user_meta_data->>'username';
    username_generated := regexp_replace(username_generated, '[^a-zA-Z0-9]', '', 'g');
    username_generated := lower(substring(username_generated from 1 for 17));
  ELSE
    -- Se não tiver, gerar a partir do email
    username_generated := split_part(NEW.email, '@', 1);
    username_generated := regexp_replace(username_generated, '[^a-zA-Z0-9]', '', 'g');
    username_generated := lower(substring(username_generated from 1 for 17));
  END IF;
  
  -- Garantir que o username é único
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

  -- Atribuir role
  IF (SELECT COUNT(*) FROM public.profiles) = 1 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;

  RETURN NEW;
END;
$function$;