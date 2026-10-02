-- ============================================================================
-- SIGNUP ATTRIBUTION TRACKING
-- ============================================================================
-- Adiciona colunas de atribuição de cadastro (UTM, ref, referrer) em profiles
-- e uma RPC SECURITY DEFINER que as grava UMA vez por usuário.
--
-- Usuários NÃO podem alterar essas colunas diretamente (trigger abaixo).
-- Idempotente: pode ser reaplicada sem erro.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_source text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_medium text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_campaign text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_content text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_ref text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_referrer text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_landing text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_attributed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_signup_attributed_at
  ON public.profiles (signup_attributed_at)
  WHERE signup_attributed_at IS NOT NULL;

COMMENT ON COLUMN public.profiles.signup_source IS 'Origem do cadastro (first-touch): utm_source > host do referrer > ''ref'' > ''direct''';
COMMENT ON COLUMN public.profiles.signup_medium IS 'UTM medium da primeira visita (''referral'' quando a origem veio do referrer)';
COMMENT ON COLUMN public.profiles.signup_campaign IS 'UTM campaign da primeira visita';
COMMENT ON COLUMN public.profiles.signup_content IS 'UTM content da primeira visita';
COMMENT ON COLUMN public.profiles.signup_ref IS 'Parâmetro ref= da primeira visita';
COMMENT ON COLUMN public.profiles.signup_referrer IS 'Host do referrer externo da primeira visita (sem caminho/query)';
COMMENT ON COLUMN public.profiles.signup_landing IS 'Caminho da landing page da primeira visita';
COMMENT ON COLUMN public.profiles.signup_attributed_at IS 'Quando a atribuição foi gravada (NULL = ainda não atribuído)';

-- ============================================================================
-- TRIGGER: colunas signup_* só podem ser escritas pelo servidor
-- ============================================================================
-- SECURITY INVOKER de propósito: current_user reflete quem executa o UPDATE.
--   * cliente via PostgREST (anon/authenticated)       -> current_user = anon/authenticated -> bloqueado
--   * outras funções SECURITY DEFINER chamadas pelo cliente (saldo, XP, username...)
--       -> current_user = dono, auth.role() = authenticated, sem flag -> signup_* preservadas (no-op)
--   * record_signup_attribution (SECURITY DEFINER + flag local da transação) -> permitido
--   * service_role / SQL direto (migrations, SQL editor, cron) -> permitido
-- O flag sozinho não basta (o cliente roda como authenticated e é bloqueado antes),
-- então não dá para falsificá-lo.
-- Valores são revertidos silenciosamente (sem RAISE) para não quebrar updates que
-- enviam a linha inteira do perfil.

CREATE OR REPLACE FUNCTION public.protect_signup_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     OR (
       auth.role() IN ('anon', 'authenticated')
       AND current_setting('duelverse.signup_attribution_write', true) IS DISTINCT FROM 'on'
     )
  THEN
    NEW.signup_source        := OLD.signup_source;
    NEW.signup_medium        := OLD.signup_medium;
    NEW.signup_campaign      := OLD.signup_campaign;
    NEW.signup_content       := OLD.signup_content;
    NEW.signup_ref           := OLD.signup_ref;
    NEW.signup_referrer      := OLD.signup_referrer;
    NEW.signup_landing       := OLD.signup_landing;
    NEW.signup_attributed_at := OLD.signup_attributed_at;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_signup_attribution() IS
  'Impede que clientes alterem profiles.signup_*; só record_signup_attribution, service_role e SQL direto podem.';

-- Só dispara quando alguma coluna signup_* está no SET (não pesa nos updates
-- frequentes de is_online/last_seen etc.).
DROP TRIGGER IF EXISTS protect_signup_attribution_trigger ON public.profiles;
CREATE TRIGGER protect_signup_attribution_trigger
  BEFORE UPDATE OF signup_source, signup_medium, signup_campaign, signup_content,
                   signup_ref, signup_referrer, signup_landing, signup_attributed_at
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_signup_attribution();

-- ============================================================================
-- RPC: record_signup_attribution
-- ============================================================================
-- Retorno:
--   true  -> gravou agora (cliente dispara GA4 sign_up)
--   false -> não autenticado, já atribuído, ou conta criada há mais de 24h
--   NULL  -> perfil ainda não existe (cliente pode tentar de novo)

CREATE OR REPLACE FUNCTION public.record_signup_attribution(
  p_source   text DEFAULT NULL,
  p_medium   text DEFAULT NULL,
  p_campaign text DEFAULT NULL,
  p_content  text DEFAULT NULL,
  p_ref      text DEFAULT NULL,
  p_referrer text DEFAULT NULL,
  p_landing  text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_created_at timestamptz;
  v_attributed_at timestamptz;
  v_source text;
  v_medium text;
  v_campaign text;
  v_content text;
  v_ref text;
  v_referrer text;
  v_landing text;
  v_written boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT u.created_at INTO v_user_created_at FROM auth.users u WHERE u.id = v_user_id;
  IF v_user_created_at IS NULL OR now() - v_user_created_at > interval '24 hours' THEN
    RETURN false;
  END IF;

  SELECT p.signup_attributed_at INTO v_attributed_at FROM public.profiles p WHERE p.user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN NULL; -- perfil ainda não criado
  END IF;
  IF v_attributed_at IS NOT NULL THEN
    RETURN false;
  END IF;

  -- Sanitizar: remove caracteres de controle, trim e limita tamanho
  v_source   := NULLIF(btrim(left(btrim(regexp_replace(p_source,   '[[:cntrl:]]', '', 'g')), 100)), '');
  v_medium   := NULLIF(btrim(left(btrim(regexp_replace(p_medium,   '[[:cntrl:]]', '', 'g')), 100)), '');
  v_campaign := NULLIF(btrim(left(btrim(regexp_replace(p_campaign, '[[:cntrl:]]', '', 'g')), 100)), '');
  v_content  := NULLIF(btrim(left(btrim(regexp_replace(p_content,  '[[:cntrl:]]', '', 'g')), 100)), '');
  v_ref      := NULLIF(btrim(left(btrim(regexp_replace(p_ref,      '[[:cntrl:]]', '', 'g')), 100)), '');
  v_referrer := NULLIF(btrim(left(btrim(regexp_replace(p_referrer, '[[:cntrl:]]', '', 'g')), 255)), '');
  v_landing  := NULLIF(btrim(left(btrim(regexp_replace(p_landing,  '[[:cntrl:]]', '', 'g')), 100)), '');

  -- Origem: utm_source > host do referrer (medium 'referral') > 'ref' > 'direct'
  IF v_source IS NULL THEN
    IF v_referrer IS NOT NULL THEN
      v_source := left(v_referrer, 100);
      v_medium := COALESCE(v_medium, 'referral');
    ELSIF v_ref IS NOT NULL THEN
      v_source := 'ref';
    ELSE
      v_source := 'direct';
    END IF;
  END IF;

  -- Libera o trigger de proteção só para este UPDATE (flag local da transação)
  PERFORM set_config('duelverse.signup_attribution_write', 'on', true);

  UPDATE public.profiles
  SET signup_source        = v_source,
      signup_medium        = v_medium,
      signup_campaign      = v_campaign,
      signup_content       = v_content,
      signup_ref           = v_ref,
      signup_referrer      = v_referrer,
      signup_landing       = v_landing,
      signup_attributed_at = now()
  WHERE user_id = v_user_id
    AND signup_attributed_at IS NULL;
  v_written := FOUND;

  PERFORM set_config('duelverse.signup_attribution_write', 'off', true);

  RETURN v_written;
END;
$$;

REVOKE ALL ON FUNCTION public.record_signup_attribution(text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_signup_attribution(text, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_signup_attribution(text, text, text, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.record_signup_attribution(text, text, text, text, text, text, text) IS
  'Grava a atribuição de cadastro (UTM/ref/referrer) do usuário autenticado: uma única vez e só para contas criadas há menos de 24h. true=gravou, false=não elegível, NULL=perfil ainda não existe.';
