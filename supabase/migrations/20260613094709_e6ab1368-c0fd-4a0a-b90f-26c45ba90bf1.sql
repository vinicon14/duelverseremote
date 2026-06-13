-- Permite que o próprio usuário diminua seu saldo (ex.: pagar pool de torneio),
-- mas continua bloqueando aumentos ou alterações nas outras colunas sensíveis.
CREATE OR REPLACE FUNCTION public.prevent_profile_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := current_setting('role', true);
  v_is_admin boolean := false;
  v_is_self boolean := (auth.uid() = NEW.user_id);
BEGIN
  IF v_role IN ('service_role', 'postgres', 'supabase_admin') THEN
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

  -- Saldo: o dono pode apenas DIMINUIR; ninguém mais pode mudar.
  IF NEW.duelcoins_balance IS DISTINCT FROM OLD.duelcoins_balance THEN
    IF NOT v_is_self OR NEW.duelcoins_balance > OLD.duelcoins_balance THEN
      RAISE EXCEPTION 'Alteração de saldo só pode ser feita pelo servidor.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Outras colunas críticas: sempre bloqueadas para usuários comuns.
  IF NEW.account_type IS DISTINCT FROM OLD.account_type
     OR NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.is_banned   IS DISTINCT FROM OLD.is_banned
     OR NEW.level       IS DISTINCT FROM OLD.level
     OR NEW.points      IS DISTINCT FROM OLD.points
     OR NEW.wins        IS DISTINCT FROM OLD.wins
     OR NEW.losses      IS DISTINCT FROM OLD.losses
  THEN
    RAISE EXCEPTION 'Campo protegido: estatísticas, nível, status ou tipo de conta só podem ser alterados pelo servidor.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- RPC: criador do torneio paga prêmio ao vencedor.
CREATE OR REPLACE FUNCTION public.tournament_pay_winner(
  p_tournament_id uuid,
  p_winner_id uuid,
  p_amount integer
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_creator uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'message', 'Valor inválido');
  END IF;

  SELECT created_by INTO v_creator FROM tournaments WHERE id = p_tournament_id;
  IF v_creator IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;
  IF v_creator <> v_caller AND NOT public.is_admin(v_caller) THEN
    RETURN json_build_object('success', false, 'message', 'Apenas o criador do torneio pode pagar o prêmio');
  END IF;

  UPDATE profiles SET duelcoins_balance = duelcoins_balance + p_amount
   WHERE user_id = p_winner_id;

  INSERT INTO duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, tournament_id, description)
  VALUES (p_tournament_id, p_winner_id, p_amount, 'tournament_prize', p_tournament_id, 'Prêmio do torneio');

  RETURN json_build_object('success', true);
END;
$$;

-- RPC: criador do torneio devolve a taxa de inscrição a um participante.
CREATE OR REPLACE FUNCTION public.tournament_refund_participant(
  p_tournament_id uuid,
  p_participant_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_creator uuid;
  v_fee integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  SELECT created_by, entry_fee INTO v_creator, v_fee
    FROM tournaments WHERE id = p_tournament_id;
  IF v_creator IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;
  IF v_creator <> v_caller AND NOT public.is_admin(v_caller) THEN
    RETURN json_build_object('success', false, 'message', 'Apenas o criador do torneio pode reembolsar participantes');
  END IF;

  IF COALESCE(v_fee, 0) <= 0 THEN
    RETURN json_build_object('success', true, 'refunded', 0);
  END IF;

  UPDATE profiles SET duelcoins_balance = duelcoins_balance + v_fee
   WHERE user_id = p_participant_id;

  INSERT INTO duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, tournament_id, description)
  VALUES (p_tournament_id, p_participant_id, v_fee, 'tournament_refund', p_tournament_id, 'Reembolso de inscrição');

  RETURN json_build_object('success', true, 'refunded', v_fee);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tournament_pay_winner(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tournament_refund_participant(uuid, uuid) TO authenticated;