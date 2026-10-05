-- Migration: Reduce DuelCoins rewards by 10x
-- 
-- Daily missions should now pay 8 DC/day (before: 80 DC/day)
-- PRO subscription at 20 DC should take ~2.5 days of missions
--
-- Changes:
-- - Battle Pass mission rewards divided by 10
-- - Battle Pass level rewards (free and pro tracks) divided by 10
-- - XP unchanged, items unchanged, requirements unchanged
-- - Zero values remain zero
-- - Idempotent: uses marker column to prevent double reduction

-- Add marker column to track if rewards have been reduced (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'battle_pass_missions' 
      AND column_name = 'rewards_reduced_10x'
  ) THEN
    ALTER TABLE public.battle_pass_missions 
      ADD COLUMN rewards_reduced_10x boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'battle_pass_rewards' 
      AND column_name = 'rewards_reduced_10x'
  ) THEN
    ALTER TABLE public.battle_pass_rewards 
      ADD COLUMN rewards_reduced_10x boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Reduce Battle Pass mission rewards by 10x (only those not yet reduced)
UPDATE public.battle_pass_missions
SET 
  reward_duelcoins = CASE 
    WHEN reward_duelcoins > 0 THEN GREATEST(1, ROUND(reward_duelcoins / 10.0))
    ELSE 0 
  END,
  rewards_reduced_10x = true,
  updated_at = now()
WHERE 
  rewards_reduced_10x = false 
  AND is_active = true;

-- Reduce Battle Pass level rewards by 10x (only those not yet reduced, and only duelcoins type)
UPDATE public.battle_pass_rewards
SET 
  amount = CASE 
    WHEN reward_type = 'duelcoins' AND amount > 0 THEN GREATEST(1, ROUND(amount / 10.0))
    ELSE amount 
  END,
  rewards_reduced_10x = true,
  updated_at = now()
WHERE 
  rewards_reduced_10x = false 
  AND reward_type = 'duelcoins';

-- Update title descriptions that contain the old DC amounts (only for duelcoins rewards)
UPDATE public.battle_pass_rewards r
SET 
  title = CASE 
    -- Extract number from title and replace with new value
    WHEN title ~ '^\d+ DuelCoins$' THEN
      GREATEST(1, ROUND((regexp_match(title, '(\d+)'))[1]::integer / 10.0))::text || ' DuelCoins'
    ELSE title
  END,
  updated_at = now()
WHERE 
  reward_type = 'duelcoins'
  AND rewards_reduced_10x = true
  AND title ~ '^\d+ DuelCoins$';

-- Verify the changes with a summary
DO $$
DECLARE
  v_missions_updated integer;
  v_rewards_updated integer;
BEGIN
  SELECT COUNT(*) INTO v_missions_updated 
  FROM public.battle_pass_missions 
  WHERE rewards_reduced_10x = true;
  
  SELECT COUNT(*) INTO v_rewards_updated 
  FROM public.battle_pass_rewards 
  WHERE rewards_reduced_10x = true AND reward_type = 'duelcoins';
  
  RAISE NOTICE 'DuelCoins rewards reduced by 10x:';
  RAISE NOTICE '  - % mission rewards updated', v_missions_updated;
  RAISE NOTICE '  - % level rewards updated', v_rewards_updated;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN public.battle_pass_missions.rewards_reduced_10x IS 
  'Marker to track if reward_duelcoins has been reduced by 10x (migration 20261005103000)';

COMMENT ON COLUMN public.battle_pass_rewards.rewards_reduced_10x IS 
  'Marker to track if amount (for duelcoins type) has been reduced by 10x (migration 20261005103000)';
