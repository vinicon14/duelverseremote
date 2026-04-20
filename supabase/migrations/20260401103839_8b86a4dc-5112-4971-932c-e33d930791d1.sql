
CREATE OR REPLACE FUNCTION public.reward_judge_resolution(p_judge_id uuid, p_log_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log record;
BEGIN
  SELECT * INTO v_log FROM public.judge_logs WHERE id = p_log_id;

  IF v_log IS NULL THEN
    RETURN false;
  END IF;

  IF v_log.judge_entered_at IS NULL THEN
    RETURN false;
  END IF;

  -- Use 110 seconds instead of 120 to account for clock skew
  IF (now() - v_log.judge_entered_at) < interval '110 seconds' THEN
    RETURN false;
  END IF;

  IF v_log.judge_id != p_judge_id THEN
    RETURN false;
  END IF;

  -- Check not already rewarded for this log
  IF EXISTS (
    SELECT 1 FROM public.duelcoins_transactions
    WHERE receiver_id = p_judge_id
      AND transaction_type = 'judge_reward'
      AND description LIKE '%' || p_log_id::text || '%'
  ) THEN
    RETURN false;
  END IF;

  -- Award 2 DuelCoins
  UPDATE public.profiles
  SET duelcoins_balance = duelcoins_balance + 2
  WHERE user_id = p_judge_id;

  -- Log the transaction
  INSERT INTO public.duelcoins_transactions (
    receiver_id, amount, transaction_type, description
  ) VALUES (
    p_judge_id, 2, 'judge_reward',
    'Recompensa por resolver chamada de juiz (log: ' || p_log_id::text || ')'
  );

  RETURN true;
END;
$$;
