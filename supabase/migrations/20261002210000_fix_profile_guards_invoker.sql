-- ============================================================================
-- FIX: Mudar profile guards de SECURITY DEFINER para SECURITY INVOKER
-- ============================================================================
--
-- PROBLEMA: Os triggers prevent_profile_privilege_escalation e 
-- prevent_profile_tampering eram SECURITY DEFINER e começavam com
-- IF current_user IN ('postgres','supabase_admin','service_role').
--
-- Como SECURITY DEFINER roda como o dono (postgres), current_user é sempre
-- 'postgres', então a checagem nunca bloqueava nada. Usuários autenticados
-- conseguiam fazer UPDATE profiles SET duelcoins_balance=999999 com sucesso.
--
-- SOLUÇÃO: Recriar as funções como SECURITY INVOKER. Com invoker:
-- - Clientes rodam como 'authenticated' e ficam bloqueados
-- - Funções SECURITY DEFINER do servidor (dono postgres) passam
-- - service_role passa via auth.role() = 'service_role'
-- - is_admin() continua funcionando (é SECURITY DEFINER e consulta user_roles)
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO public
AS $function$
BEGIN
  -- Permitir service_role via auth.role()
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Permitir funções SECURITY DEFINER do servidor via flag de sessão
  -- (RPCs como create_weekly_tournament setam isso antes de UPDATE)
  IF current_setting('app.bypass_profile_guard', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Permitir admins (is_admin é SECURITY DEFINER, consulta user_roles)
  IF is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Bloquear modificação de campos privilegiados
  IF NEW.duelcoins_balance IS DISTINCT FROM OLD.duelcoins_balance
     OR NEW.account_type    IS DISTINCT FROM OLD.account_type
     OR NEW.is_banned       IS DISTINCT FROM OLD.is_banned
     OR NEW.points          IS DISTINCT FROM OLD.points
     OR NEW.wins            IS DISTINCT FROM OLD.wins
     OR NEW.losses          IS DISTINCT FROM OLD.losses
     OR NEW.level           IS DISTINCT FROM OLD.level
     OR NEW.user_id         IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
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
  v_is_self boolean := (auth.uid() = NEW.user_id);
BEGIN
  -- Permitir service_role via auth.role()
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Permitir funções SECURITY DEFINER do servidor via flag de sessão
  IF current_setting('app.bypass_profile_guard', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Checar se é admin (is_admin é SECURITY DEFINER)
  BEGIN
    v_is_admin := public.is_admin(auth.uid());
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;
  
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Bloquear redução de saldo ou qualquer aumento de saldo pelo próprio usuário
  IF NEW.duelcoins_balance IS DISTINCT FROM OLD.duelcoins_balance THEN
    IF NOT v_is_self OR NEW.duelcoins_balance > OLD.duelcoins_balance THEN
      RAISE EXCEPTION 'Alteração de saldo só pode ser feita pelo servidor.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Bloquear modificação de campos protegidos
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

-- Recriar os triggers para garantir que usam as funções atualizadas
-- (idempotente: DROP IF EXISTS + CREATE)
DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation_trigger ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

DROP TRIGGER IF EXISTS prevent_profile_tampering_trigger ON public.profiles;
CREATE TRIGGER prevent_profile_tampering_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_tampering();
