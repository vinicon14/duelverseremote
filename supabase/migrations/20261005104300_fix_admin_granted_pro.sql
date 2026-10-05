-- =====================================================
-- Correção: PRO concedido por admin é removido na expiração
-- Data: 2026-10-05 10:43:00
-- =====================================================
--
-- PROBLEMA 3: check_expired_subscriptions já preserva PRO de usuários com role
-- admin, mas remove PRO de usuários que receberam PRO manualmente do admin
-- (não através de user_roles, mas via UPDATE direto em profiles).
--
-- SOLUÇÃO: Adicionar coluna granted_by em user_subscriptions para marcar
-- assinaturas concedidas manualmente. check_expired_subscriptions preserva
-- PRO quando existe subscription ativa COM granted_by (concessão admin) OU
-- quando o usuário tem role admin.
-- =====================================================

-- Adiciona coluna para rastrear concessões manuais de admin
ALTER TABLE public.user_subscriptions 
  ADD COLUMN IF NOT EXISTS granted_by UUID REFERENCES public.profiles(user_id);

-- Índice para performance em check_expired_subscriptions
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_granted_by 
  ON public.user_subscriptions(granted_by) 
  WHERE granted_by IS NOT NULL;

-- Comentário para documentar o uso
COMMENT ON COLUMN public.user_subscriptions.granted_by IS 
  'Admin que concedeu esta assinatura manualmente (NULL para compras normais). check_expired_subscriptions preserva PRO quando granted_by IS NOT NULL.';

-- Atualiza check_expired_subscriptions para preservar PRO concedido por admin
CREATE OR REPLACE FUNCTION public.check_expired_subscriptions()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Desativa assinaturas expiradas
  UPDATE user_subscriptions 
  SET is_active = false
  WHERE is_active = true 
    AND expires_at < now();

  -- Reverte account_type para 'free' SOMENTE quando:
  --   1. O usuário NÃO tem role admin
  --   2. O usuário NÃO tem assinatura ativa (paga ou concedida)
  --   3. O usuário NÃO tem assinatura concedida por admin (mesmo se expirada)
  UPDATE profiles 
  SET account_type = 'free'
  WHERE account_type = 'pro'
    -- Não é admin
    AND user_id NOT IN (
      SELECT user_id 
      FROM user_roles 
      WHERE role = 'admin'
    )
    -- Não tem assinatura ativa
    AND user_id NOT IN (
      SELECT user_id 
      FROM user_subscriptions 
      WHERE is_active = true 
        AND expires_at >= now()
    )
    -- Não tem concessão manual de admin (mesmo expirada)
    AND user_id NOT IN (
      SELECT user_id 
      FROM user_subscriptions 
      WHERE granted_by IS NOT NULL
    );
END;
$$;

-- Documenta a função
COMMENT ON FUNCTION public.check_expired_subscriptions() IS 
  'Expira assinaturas vencidas e remove PRO de usuários sem assinatura ativa, EXCETO: admins (user_roles), assinaturas concedidas por admin (granted_by IS NOT NULL).';

-- Cria helper function para admins concederem PRO manualmente
CREATE OR REPLACE FUNCTION public.grant_pro_subscription(
  p_user_id UUID,
  p_duration_days INTEGER DEFAULT 365
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_subscription_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Só admins podem conceder
  IF v_caller IS NULL OR NOT public.is_admin(v_caller) THEN
    RETURN json_build_object('success', false, 'message', 'Apenas administradores podem conceder PRO');
  END IF;

  -- Valida duração
  IF p_duration_days IS NULL OR p_duration_days <= 0 THEN
    RETURN json_build_object('success', false, 'message', 'Duração inválida');
  END IF;

  -- Valida usuário
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = p_user_id) THEN
    RETURN json_build_object('success', false, 'message', 'Usuário não encontrado');
  END IF;

  -- Calcula expiração
  v_expires_at := now() + (p_duration_days || ' days')::interval;

  -- Desativa assinaturas anteriores
  UPDATE user_subscriptions 
  SET is_active = false 
  WHERE user_id = p_user_id 
    AND is_active = true;

  -- Cria assinatura concedida (plan_id NULL para concessões manuais)
  INSERT INTO user_subscriptions (
    user_id, 
    plan_id, 
    is_active, 
    starts_at, 
    expires_at, 
    granted_by
  ) VALUES (
    p_user_id,
    NULL,
    true,
    now(),
    v_expires_at,
    v_caller
  )
  RETURNING id INTO v_subscription_id;

  -- Ativa PRO
  UPDATE profiles 
  SET account_type = 'pro' 
  WHERE user_id = p_user_id;

  RETURN json_build_object(
    'success', true, 
    'message', 'PRO concedido com sucesso',
    'subscription_id', v_subscription_id,
    'expires_at', v_expires_at,
    'granted_by', v_caller
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_pro_subscription(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_pro_subscription(UUID, INTEGER) TO authenticated, service_role;

COMMENT ON FUNCTION public.grant_pro_subscription(UUID, INTEGER) IS 
  'Admin concede PRO manualmente a um usuário. granted_by é registrado para preservar PRO na expiração de outras assinaturas.';
