-- Fix DuelCoins removal by allowing NULL receiver_id for admin_remove transactions
ALTER TABLE public.duelcoins_transactions ALTER COLUMN receiver_id DROP NOT NULL;

-- Update the admin_manage_duelcoins function to handle removal properly
CREATE OR REPLACE FUNCTION public.admin_manage_duelcoins(
  p_user_id uuid,
  p_amount integer,
  p_operation text,
  p_reason text DEFAULT 'Ajuste administrativo'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance integer;
  v_new_balance integer;
BEGIN
  -- Get current balance
  SELECT duelcoins_balance INTO v_current_balance
  FROM profiles
  WHERE user_id = p_user_id;

  IF v_current_balance IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Usuário não encontrado');
  END IF;

  IF p_operation = 'add' THEN
    v_new_balance := v_current_balance + p_amount;
    
    -- Update balance
    UPDATE profiles
    SET duelcoins_balance = v_new_balance
    WHERE user_id = p_user_id;
    
    -- Create transaction record
    INSERT INTO duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, description)
    VALUES (NULL, p_user_id, p_amount, 'admin_add', p_reason);
    
    RETURN json_build_object('success', true, 'message', format('Adicionado %s DuelCoins. Novo saldo: %s', p_amount, v_new_balance));
    
  ELSIF p_operation = 'remove' THEN
    IF v_current_balance < p_amount THEN
      RETURN json_build_object('success', false, 'message', format('Saldo insuficiente. Saldo atual: %s', v_current_balance));
    END IF;
    
    v_new_balance := v_current_balance - p_amount;
    
    -- Update balance
    UPDATE profiles
    SET duelcoins_balance = v_new_balance
    WHERE user_id = p_user_id;
    
    -- Create transaction record with sender_id as the user (money leaves their account)
    INSERT INTO duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, description)
    VALUES (p_user_id, NULL, p_amount, 'admin_remove', p_reason);
    
    RETURN json_build_object('success', true, 'message', format('Removido %s DuelCoins. Novo saldo: %s', p_amount, v_new_balance));
  ELSE
    RETURN json_build_object('success', false, 'message', 'Operação inválida');
  END IF;
END;
$$;