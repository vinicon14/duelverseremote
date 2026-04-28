
CREATE OR REPLACE FUNCTION public.transfer_duelcoins(p_receiver_id uuid, p_amount integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sender_id UUID;
  v_sender_balance INTEGER;
  v_receiver_username TEXT;
  v_sender_username TEXT;
BEGIN
  v_sender_id := auth.uid();
  IF v_sender_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  IF v_sender_id = p_receiver_id THEN
    RETURN json_build_object('success', false, 'message', 'Não é possível enviar DuelCoins para si mesmo');
  END IF;

  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'message', 'Quantidade inválida');
  END IF;

  SELECT duelcoins_balance INTO v_sender_balance
  FROM public.profiles
  WHERE user_id = v_sender_id;

  IF v_sender_balance < p_amount THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_receiver_id) THEN
    RETURN json_build_object('success', false, 'message', 'Usuário destinatário não encontrado');
  END IF;

  SELECT username INTO v_sender_username FROM public.profiles WHERE user_id = v_sender_id;
  SELECT username INTO v_receiver_username FROM public.profiles WHERE user_id = p_receiver_id;

  BEGIN
    UPDATE public.profiles
    SET duelcoins_balance = duelcoins_balance - p_amount
    WHERE user_id = v_sender_id;

    UPDATE public.profiles
    SET duelcoins_balance = duelcoins_balance + p_amount
    WHERE user_id = p_receiver_id;

    INSERT INTO public.duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, description)
    VALUES (
      v_sender_id, 
      p_receiver_id, 
      p_amount, 
      'transfer',
      format('Transferência de %s para %s', v_sender_username, v_receiver_username)
    );

    -- Notification for sender
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      v_sender_id,
      'duelcoins_transfer',
      '💸 DuelCoins Enviados',
      format('Você enviou %s DuelCoins para %s', p_amount, v_receiver_username),
      jsonb_build_object('type', 'duelcoins_transfer', 'amount', p_amount, 'recipient', v_receiver_username, 'url', '/transfer-history')
    );

    -- Notification for receiver
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      p_receiver_id,
      'duelcoins_received',
      '🪙 DuelCoins Recebidos!',
      format('%s enviou %s DuelCoins para você!', v_sender_username, p_amount),
      jsonb_build_object('type', 'duelcoins_received', 'amount', p_amount, 'sender', v_sender_username, 'url', '/transfer-history')
    );

    RETURN json_build_object(
      'success', true, 
      'message', format('Transferência de %s DuelCoins para %s realizada com sucesso!', p_amount, v_receiver_username)
    );
  EXCEPTION
    WHEN OTHERS THEN
      RETURN json_build_object('success', false, 'message', 'Erro ao processar transferência');
  END;
END;
$function$;
