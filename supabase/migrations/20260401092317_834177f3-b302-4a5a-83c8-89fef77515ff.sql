
-- Function to reward judge with 2 duelcoins after resolving a call
CREATE OR REPLACE FUNCTION public.reward_judge_resolution(p_judge_id uuid, p_log_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entered_at timestamptz;
  v_duration interval;
BEGIN
  -- Check judge entered at least 2 minutes ago
  SELECT created_at INTO v_entered_at
  FROM judge_logs
  WHERE id = p_log_id AND judge_id = p_judge_id AND status = 'in_room';
  
  IF v_entered_at IS NULL THEN
    RETURN false;
  END IF;
  
  v_duration := now() - v_entered_at;
  
  -- Must have been in room for at least 2 minutes
  IF v_duration < interval '2 minutes' THEN
    RETURN false;
  END IF;
  
  -- Add 2 duelcoins to judge
  UPDATE profiles SET duelcoins_balance = duelcoins_balance + 2 WHERE user_id = p_judge_id;
  
  -- Log the transaction
  INSERT INTO duelcoins_transactions (receiver_id, amount, transaction_type, description)
  VALUES (p_judge_id, 2, 'judge_reward', 'Recompensa por resolver chamada de juiz');
  
  RETURN true;
END;
$$;

-- Function to notify all judges when a judge call is created
CREATE OR REPLACE FUNCTION public.notify_judges_on_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_judge record;
  v_player_name text;
BEGIN
  -- Get caller's username
  SELECT username INTO v_player_name FROM profiles WHERE user_id = NEW.player_id;
  
  -- Notify all judges
  FOR v_judge IN 
    SELECT user_id FROM user_roles WHERE role = 'judge'
  LOOP
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      v_judge.user_id,
      'judge_call',
      '⚖️ Chamada de Juiz',
      COALESCE(v_player_name, 'Um jogador') || ' está solicitando um juiz no duelo',
      jsonb_build_object('match_id', NEW.match_id, 'log_id', NEW.id, 'url', '/judge')
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Create trigger for judge call notifications
DROP TRIGGER IF EXISTS trigger_notify_judges_on_call ON judge_logs;
CREATE TRIGGER trigger_notify_judges_on_call
  AFTER INSERT ON judge_logs
  FOR EACH ROW
  EXECUTE FUNCTION notify_judges_on_call();
