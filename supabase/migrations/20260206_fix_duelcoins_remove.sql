-- ====================================
-- FIX: DuelCoins RemoveOperação
-- ====================================

-- Dropar a função antiga e recriar com melhor tratamento de erro
DROP FUNCTION IF EXISTS public.admin_manage_duelcoins(UUID, INTEGER, TEXT, TEXT);

-- Recriar função com suporte completo para remoção
CREATE OR REPLACE FUNCTION public.admin_manage_duelcoins(
  p_user_id UUID,
  p_amount INTEGER,
  p_operation TEXT, -- 'add' ou 'remove'
  p_reason TEXT DEFAULT 'Ajuste administrativo'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_current_balance INTEGER;
  v_username TEXT;
  v_new_balance INTEGER;
BEGIN
  -- Validar que é admin
  v_admin_id := auth.uid();
  IF NOT is_admin(v_admin_id) THEN
    RETURN json_build_object('success', false, 'message', 'Acesso negado');
  END IF;

  -- Validar operação
  IF p_operation NOT IN ('add', 'remove') THEN
    RETURN json_build_object('success', false, 'message', 'Operação inválida');
  END IF;

  -- Validar quantidade
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'message', 'Quantidade inválida');
  END IF;

  -- Verificar usuário existe
  SELECT duelcoins_balance, username INTO v_current_balance, v_username
  FROM public.profiles
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Usuário não encontrado');
  END IF;

  -- Se for remover, verificar se tem saldo suficiente
  IF p_operation = 'remove' THEN
    IF v_current_balance < p_amount THEN
      RETURN json_build_object('success', false, 'message', 'Saldo insuficiente para remoção');
    END IF;
    
    v_new_balance := v_current_balance - p_amount;
    
    UPDATE public.profiles
    SET duelcoins_balance = v_new_balance
    WHERE user_id = p_user_id;

    INSERT INTO public.duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, description)
    VALUES (p_user_id, NULL, p_amount, 'admin_remove', p_reason);

    RETURN json_build_object('success', true, 'message', format('Removidos %s DuelCoins de %s', p_amount, v_username), 'new_balance', v_new_balance);
  ELSE
    v_new_balance := v_current_balance + p_amount;
    
    UPDATE public.profiles
    SET duelcoins_balance = v_new_balance
    WHERE user_id = p_user_id;

    INSERT INTO public.duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, description)
    VALUES (NULL, p_user_id, p_amount, 'admin_add', p_reason);

    RETURN json_build_object('success', true, 'message', format('Adicionados %s DuelCoins para %s', p_amount, v_username), 'new_balance', v_new_balance);
  END IF;
END;
$$;

-- Garantir que a função está marcada como segura para execução
GRANT EXECUTE ON FUNCTION public.admin_manage_duelcoins(UUID, INTEGER, TEXT, TEXT) TO authenticated;
