-- ============================================================================
-- SIGNUP ATTRIBUTION TRACKING
-- ============================================================================
-- Adiciona colunas de atribuição de cadastro (UTM, ref, referrer) na tabela profiles
-- e cria RPC para gravá-las de forma segura (SECURITY DEFINER).
-- 
-- Usuários NÃO podem alterar essas colunas depois de gravadas.

-- Adicionar colunas de atribuição em profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_source text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_medium text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_campaign text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_content text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_ref text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_referrer text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_landing text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_attributed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_signup_source ON public.profiles(signup_source);
CREATE INDEX IF NOT EXISTS idx_profiles_signup_attributed_at ON public.profiles(signup_attributed_at);

-- Comentários para documentação
COMMENT ON COLUMN public.profiles.signup_source IS 'UTM source da primeira visita (first-touch)';
COMMENT ON COLUMN public.profiles.signup_medium IS 'UTM medium da primeira visita';
COMMENT ON COLUMN public.profiles.signup_campaign IS 'UTM campaign da primeira visita';
COMMENT ON COLUMN public.profiles.signup_content IS 'UTM content da primeira visita';
COMMENT ON COLUMN public.profiles.signup_ref IS 'Parâmetro ref= da primeira visita';
COMMENT ON COLUMN public.profiles.signup_referrer IS 'HTTP referrer externo da primeira visita';
COMMENT ON COLUMN public.profiles.signup_landing IS 'Caminho da landing page da primeira visita';
COMMENT ON COLUMN public.profiles.signup_attributed_at IS 'Timestamp da gravação da atribuição';

-- ============================================================================
-- RPC: record_signup_attribution
-- ============================================================================
-- Grava a atribuição do cadastro (first-touch) para o usuário autenticado.
-- 
-- Regras:
-- - Só grava para auth.uid()
-- - Só grava se signup_attributed_at IS NULL (first-touch)
-- - Só grava se o usuário em auth.users foi criado há menos de 24h
-- - Aplica limites de tamanho (100 chars por campo, 255 para referrer)
-- - Se não vier nada, grava signup_source = 'direct'
-- - Retorna true se gravou, false caso contrário

CREATE OR REPLACE FUNCTION public.record_signup_attribution(
  p_source text DEFAULT NULL,
  p_medium text DEFAULT NULL,
  p_campaign text DEFAULT NULL,
  p_content text DEFAULT NULL,
  p_ref text DEFAULT NULL,
  p_referrer text DEFAULT NULL,
  p_landing text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_created_at timestamptz;
  v_source text;
  v_medium text;
  v_campaign text;
  v_content text;
  v_ref text;
  v_referrer text;
  v_landing text;
BEGIN
  -- Só grava para o usuário autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Verificar se já existe atribuição
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = v_user_id AND signup_attributed_at IS NOT NULL
  ) THEN
    RETURN false;
  END IF;

  -- Verificar se o usuário foi criado há menos de 24h
  SELECT created_at INTO v_user_created_at
  FROM auth.users
  WHERE id = v_user_id;

  IF v_user_created_at IS NULL OR (now() - v_user_created_at) > interval '24 hours' THEN
    RETURN false;
  END IF;

  -- Sanitizar e limitar tamanho
  v_source := NULLIF(trim(substring(p_source from 1 for 100)), '');
  v_medium := NULLIF(trim(substring(p_medium from 1 for 100)), '');
  v_campaign := NULLIF(trim(substring(p_campaign from 1 for 100)), '');
  v_content := NULLIF(trim(substring(p_content from 1 for 100)), '');
  v_ref := NULLIF(trim(substring(p_ref from 1 for 100)), '');
  v_referrer := NULLIF(trim(substring(p_referrer from 1 for 255)), '');
  v_landing := NULLIF(trim(substring(p_landing from 1 for 100)), '');

  -- Se não veio nada, gravar como 'direct'
  IF v_source IS NULL AND v_medium IS NULL AND v_campaign IS NULL AND v_content IS NULL AND v_ref IS NULL THEN
    v_source := 'direct';
  END IF;

  -- Gravar atribuição
  UPDATE public.profiles
  SET
    signup_source = v_source,
    signup_medium = v_medium,
    signup_campaign = v_campaign,
    signup_content = v_content,
    signup_ref = v_ref,
    signup_referrer = v_referrer,
    signup_landing = v_landing,
    signup_attributed_at = now()
  WHERE user_id = v_user_id
    AND signup_attributed_at IS NULL;

  RETURN FOUND;
END;
$$;

-- Permissões: apenas authenticated pode executar
REVOKE ALL ON FUNCTION public.record_signup_attribution FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_signup_attribution FROM anon;
GRANT EXECUTE ON FUNCTION public.record_signup_attribution TO authenticated;

COMMENT ON FUNCTION public.record_signup_attribution IS 'Grava atribuição de cadastro (UTM/ref) para o usuário autenticado. Só grava na primeira vez e para usuários criados há menos de 24h.';

-- ============================================================================
-- TRIGGER: Proteger colunas signup_* contra alteração por usuários
-- ============================================================================
-- As policies de UPDATE em profiles permitem que o usuário altere qualquer coluna.
-- Este trigger garante que as colunas signup_* não possam ser alteradas,
-- exceto pela RPC record_signup_attribution (que roda como service_role).

CREATE OR REPLACE FUNCTION public.protect_signup_attribution()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Se a role não for service_role, mantém os valores OLD das colunas signup_*
  IF auth.role() != 'service_role' THEN
    NEW.signup_source := OLD.signup_source;
    NEW.signup_medium := OLD.signup_medium;
    NEW.signup_campaign := OLD.signup_campaign;
    NEW.signup_content := OLD.signup_content;
    NEW.signup_ref := OLD.signup_ref;
    NEW.signup_referrer := OLD.signup_referrer;
    NEW.signup_landing := OLD.signup_landing;
    NEW.signup_attributed_at := OLD.signup_attributed_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_signup_attribution_trigger ON public.profiles;

CREATE TRIGGER protect_signup_attribution_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_signup_attribution();

COMMENT ON FUNCTION public.protect_signup_attribution IS 'Protege colunas signup_* contra alteração por usuários (só service_role pode alterar)';
