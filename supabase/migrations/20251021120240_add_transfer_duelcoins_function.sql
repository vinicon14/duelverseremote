CREATE OR REPLACE FUNCTION transfer_duelcoins(
  sender_id_param UUID,
  receiver_username_param TEXT,
  amount_param INT
)
RETURNS VOID AS $$
DECLARE
  receiver_id_var UUID;
  sender_balance INT;
BEGIN
  -- Validar a quantia
  IF amount_param <= 0 THEN
    RAISE EXCEPTION 'A quantia deve ser positiva.';
  END IF;

  -- Obter o ID do destinatário
  SELECT user_id INTO receiver_id_var FROM public.profiles WHERE username = receiver_username_param;
  IF receiver_id_var IS NULL THEN
    RAISE EXCEPTION 'Destinatário não encontrado.';
  END IF;

  -- Obter o saldo do remetente
  SELECT duelcoins_balance INTO sender_balance FROM public.profiles WHERE user_id = sender_id_param;

  -- Verificar o saldo
  IF sender_balance < amount_param THEN
    RAISE EXCEPTION 'Saldo insuficiente.';
  END IF;

  -- Executar a transferência
  UPDATE public.profiles SET duelcoins_balance = duelcoins_balance - amount_param WHERE user_id = sender_id_param;
  UPDATE public.profiles SET duelcoins_balance = duelcoins_balance + amount_param WHERE user_id = receiver_id_var;

  -- Registrar a transação
  INSERT INTO public.duelcoins_transactions (sender_id, receiver_id, amount)
  VALUES (sender_id_param, receiver_id_var, amount_param);

END;
$$ LANGUAGE plpgsql;
