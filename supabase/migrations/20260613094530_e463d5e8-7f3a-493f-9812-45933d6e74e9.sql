-- 1) Drop o INSERT policy do cliente em marketplace_purchases.
--    A RPC purchase_marketplace_items (SECURITY DEFINER) continua funcionando,
--    e admins continuam podendo inserir via "Admins can insert purchases".
DROP POLICY IF EXISTS "Users can insert own purchases" ON public.marketplace_purchases;

-- 2) Trigger em profiles bloqueando edição de colunas sensíveis pelo cliente.
--    SECURITY DEFINER RPCs (purchase_marketplace_items, award_xp, etc.) rodam como
--    postgres/service_role e ignoram este bloqueio. Admins também podem.
CREATE OR REPLACE FUNCTION public.prevent_profile_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := current_setting('role', true);
  v_is_admin boolean := false;
BEGIN
  -- Bypass: chamado por service_role ou por funções SECURITY DEFINER do projeto.
  IF v_role IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Bypass: admins autenticados.
  BEGIN
    v_is_admin := public.is_admin(auth.uid());
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Para o resto (usuário comum): rejeita qualquer mudança nas colunas sensíveis.
  IF NEW.duelcoins_balance IS DISTINCT FROM OLD.duelcoins_balance
     OR NEW.account_type      IS DISTINCT FROM OLD.account_type
     OR NEW.is_verified       IS DISTINCT FROM OLD.is_verified
     OR NEW.verified_at       IS DISTINCT FROM OLD.verified_at
     OR NEW.is_banned         IS DISTINCT FROM OLD.is_banned
     OR NEW.level             IS DISTINCT FROM OLD.level
     OR NEW.points            IS DISTINCT FROM OLD.points
     OR NEW.wins              IS DISTINCT FROM OLD.wins
     OR NEW.losses            IS DISTINCT FROM OLD.losses
  THEN
    RAISE EXCEPTION 'Campo protegido: alterações de saldo, nível, estatísticas, status ou tipo de conta só podem ser feitas pelo servidor.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_tampering ON public.profiles;
CREATE TRIGGER trg_prevent_profile_tampering
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_tampering();