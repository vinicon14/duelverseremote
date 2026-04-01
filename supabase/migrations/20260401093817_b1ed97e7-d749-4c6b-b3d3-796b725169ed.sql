
-- Add judge_entered_at column to track when judge actually entered the room
ALTER TABLE public.judge_logs ADD COLUMN IF NOT EXISTS judge_entered_at timestamp with time zone;

-- Recreate the reward function to use judge_entered_at and log transaction
CREATE OR REPLACE FUNCTION public.reward_judge_resolution(p_judge_id uuid, p_log_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_log record;
  v_already_rewarded boolean;
BEGIN
  -- Get the judge log
  SELECT * INTO v_log FROM public.judge_logs WHERE id = p_log_id;
  
  IF v_log IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check judge stayed at least 2 minutes using judge_entered_at
  IF v_log.judge_entered_at IS NULL THEN
    RETURN false;
  END IF;
  
  IF (now() - v_log.judge_entered_at) < interval '2 minutes' THEN
    RETURN false;
  END IF;
  
  -- Check judge matches
  IF v_log.judge_id != p_judge_id THEN
    RETURN false;
  END IF;

  -- Award 2 DuelCoins
  UPDATE public.profiles
  SET duelcoins_balance = duelcoins_balance + 2
  WHERE user_id = p_judge_id;

  -- Log the transaction in history
  INSERT INTO public.duelcoins_transactions (
    receiver_id,
    amount,
    transaction_type,
    description
  ) VALUES (
    p_judge_id,
    2,
    'judge_reward',
    'Recompensa por resolver chamada de juiz'
  );

  RETURN true;
END;
$function$;
