ALTER TABLE public.duelcoins_transactions DROP CONSTRAINT IF EXISTS duelcoins_transactions_transaction_type_check;
ALTER TABLE public.duelcoins_transactions ADD CONSTRAINT duelcoins_transactions_transaction_type_check CHECK (transaction_type = ANY (ARRAY['transfer','admin_add','admin_remove','tournament_entry','tournament_prize','tournament_prize_deposit','subscription','marketplace_purchase','judge_reward','nickname_change','battle_pass_reward','battle_pass_mission','battle_pass_pro']));

CREATE OR REPLACE FUNCTION public.bp_claim_reward(p_reward_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reward public.battle_pass_rewards;
  v_wins integer := 0;
  v_required integer;
  v_has_pro boolean;
  v_product uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Não autenticado'); END IF;
  SELECT * INTO v_reward FROM public.battle_pass_rewards WHERE id = p_reward_id;
  IF v_reward.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Recompensa não encontrada'); END IF;

  SELECT wins INTO v_wins FROM public.battle_pass_user_progress
   WHERE season_id = v_reward.season_id AND user_id = v_uid;
  SELECT wins_required INTO v_required FROM public.battle_pass_levels
   WHERE season_id = v_reward.season_id AND level = v_reward.level;

  IF coalesce(v_wins, 0) < coalesce(v_required, 0) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Nível ainda bloqueado');
  END IF;

  IF v_reward.track = 'pro' THEN
    SELECT EXISTS (SELECT 1 FROM public.battle_pass_purchases
                    WHERE season_id = v_reward.season_id AND user_id = v_uid) INTO v_has_pro;
    IF NOT v_has_pro THEN
      RETURN jsonb_build_object('success', false, 'message', 'Requer Battle Pass PRO');
    END IF;
  END IF;

  INSERT INTO public.battle_pass_reward_claims (reward_id, season_id, user_id)
  VALUES (v_reward.id, v_reward.season_id, v_uid)
  ON CONFLICT (reward_id, user_id) DO NOTHING;

  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Recompensa já resgatada'); END IF;

  IF v_reward.reward_type = 'duelcoins' AND v_reward.amount > 0 THEN
    UPDATE public.profiles SET duelcoins_balance = coalesce(duelcoins_balance, 0) + v_reward.amount
     WHERE user_id = v_uid;
    INSERT INTO public.duelcoins_transactions (receiver_id, amount, transaction_type, description)
    VALUES (v_uid, v_reward.amount, 'battle_pass_reward', 'Battle Pass: ' || v_reward.title);
  ELSE
    v_product := nullif(v_reward.metadata->>'product_id','')::uuid;
    IF v_product IS NOT NULL THEN
      INSERT INTO public.user_inventory (user_id, product_id, quantity)
      VALUES (v_uid, v_product, greatest(coalesce(v_reward.amount,1),1));
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Recompensa resgatada');
END;
$function$;