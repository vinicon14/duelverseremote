-- ============================================================================
-- FIX: profile guards SECURITY DEFINER -> SECURITY INVOKER (sem flag de bypass)
-- ============================================================================
--
-- PROBLEMA (20260807001435_a8065fe8*): prevent_profile_privilege_escalation() e
-- prevent_profile_tampering() eram SECURITY DEFINER e começavam com
--   IF current_user IN ('postgres','supabase_admin','service_role') THEN RETURN NEW;
-- Dentro de uma função SECURITY DEFINER, current_user é sempre o dono (postgres),
-- então os guards nunca bloqueavam nada: qualquer usuário logado conseguia
--   UPDATE profiles SET duelcoins_balance = 999999, account_type = 'pro' ...
--
-- SOLUÇÃO: SECURITY INVOKER + restringir APENAS os papéis de cliente da API
-- (anon/authenticated). Com INVOKER, current_user dentro do trigger é o papel
-- que executou o UPDATE:
--   * UPDATE direto via PostgREST/supabase-js ............ 'authenticated' -> guard ativo
--   * UPDATE feito por RPC SECURITY DEFINER (dono postgres) 'postgres'      -> liberado
--   * edge function com service_role ...................... 'service_role'  -> liberado
--   * pg_cron, SQL editor, GoTrue (handle_new_user) ........ papel do servidor -> liberado
--   * admin pelo painel (is_admin(auth.uid())) ............. liberado
--
-- Não há flag/GUC de bypass: um GUC transacional "vaza" para o resto da
-- transação (ex.: pg_graphql executa várias mutations numa única transação) e
-- exigiria alterar todas as RPCs SECURITY DEFINER que mexem em profiles.
-- Este modelo é o mesmo de protect_signup_attribution() (20261002200000).
--
-- Exceção mantida: o próprio usuário pode REDUZIR o próprio saldo (nunca abaixo
-- de 0). A edge function charge-tournament-entry-fee depende disso (ela usa o
-- JWT do usuário) e o guard prevent_profile_tampering já permitia.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO public
AS $function$
BEGIN
  -- Só clientes da API são restringidos. RPCs SECURITY DEFINER (current_user =
  -- dono), service_role, cron e SQL editor passam.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Saldo: só pode diminuir, e só o próprio dono (cobrança de inscrição).
  IF NEW.duelcoins_balance IS DISTINCT FROM OLD.duelcoins_balance
     AND NOT (
       auth.uid() IS NOT DISTINCT FROM OLD.user_id
       AND NEW.duelcoins_balance < OLD.duelcoins_balance
       AND NEW.duelcoins_balance >= 0
     )
  THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.account_type IS DISTINCT FROM OLD.account_type
     OR NEW.is_banned   IS DISTINCT FROM OLD.is_banned
     OR NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.points      IS DISTINCT FROM OLD.points
     OR NEW.wins        IS DISTINCT FROM OLD.wins
     OR NEW.losses      IS DISTINCT FROM OLD.losses
     OR NEW.level       IS DISTINCT FROM OLD.level
     OR NEW.user_id     IS DISTINCT FROM OLD.user_id
     OR NEW.created_at  IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_profile_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO public
AS $function$
DECLARE
  v_is_admin boolean := false;
  v_is_self boolean := (auth.uid() IS NOT DISTINCT FROM NEW.user_id);
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_is_admin := public.is_admin(auth.uid());
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.duelcoins_balance IS DISTINCT FROM OLD.duelcoins_balance THEN
    IF NOT v_is_self
       OR NEW.duelcoins_balance > OLD.duelcoins_balance
       OR NEW.duelcoins_balance < 0
    THEN
      RAISE EXCEPTION 'Alteração de saldo só pode ser feita pelo servidor.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.account_type IS DISTINCT FROM OLD.account_type
     OR NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.is_banned   IS DISTINCT FROM OLD.is_banned
     OR NEW.level       IS DISTINCT FROM OLD.level
     OR NEW.points      IS DISTINCT FROM OLD.points
     OR NEW.wins        IS DISTINCT FROM OLD.wins
     OR NEW.losses      IS DISTINCT FROM OLD.losses
  THEN
    RAISE EXCEPTION 'Campo protegido: estatísticas, nível, status ou tipo de conta só podem ser alterados pelo servidor.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- Triggers: mantém os nomes que já existem em produção e remove duplicatas
-- (versões anteriores deste PR criavam *_trigger além dos existentes).
DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation_trigger ON public.profiles;
DROP TRIGGER IF EXISTS prevent_profile_tampering_trigger ON public.profiles;
DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation_trg ON public.profiles;
DROP TRIGGER IF EXISTS trg_prevent_profile_tampering ON public.profiles;

CREATE TRIGGER prevent_profile_privilege_escalation_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

CREATE TRIGGER trg_prevent_profile_tampering
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_tampering();

-- Trigger functions não precisam ser chamáveis via /rpc.
REVOKE ALL ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_profile_tampering() FROM PUBLIC, anon, authenticated;
