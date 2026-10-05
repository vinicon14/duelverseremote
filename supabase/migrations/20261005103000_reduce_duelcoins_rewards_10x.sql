-- Migration: Reduce DuelCoins rewards by 10x (Battle Pass missions + level rewards)
--
-- Daily missions now pay 8 DC/day (before: 80 DC/day), so the 20 DC PRO plan
-- takes ~2.5 days of daily missions.
--
-- Scope:
--   * battle_pass_missions.reward_duelcoins  (daily / weekly / season, active or not)
--   * battle_pass_rewards.amount where reward_type = 'duelcoins' (free + pro tracks)
--   * titles in the "<N> DuelCoins" format are rewritten from the NEW amount
-- Untouched: battle_pass_seasons.pro_price_duelcoins (1000), subscription_plans,
--   goals/metrics, wins_required, cosmetic rewards (their amount is a quantity).
--
-- Formula: v > 0 -> GREATEST(1, ROUND(v / 10.0)); v = 0 stays 0.
--
-- Idempotency: every row is processed at most once, tracked by the per-row
-- marker rewards_reduced_10x. The column is created with DEFAULT false only so
-- that pre-existing rows start unprocessed; right after the one-shot UPDATE the
-- default is switched to true, so rows created later (already on the new
-- scale, e.g. via the admin panel or a new season seed) are never divided if
-- this file is re-run. Titles are rewritten in the same UPDATE as the amount,
-- so a re-run cannot divide them again either.

ALTER TABLE public.battle_pass_missions
  ADD COLUMN IF NOT EXISTS rewards_reduced_10x boolean NOT NULL DEFAULT false;
ALTER TABLE public.battle_pass_rewards
  ADD COLUMN IF NOT EXISTS rewards_reduced_10x boolean NOT NULL DEFAULT false;

-- Missions: all rows not yet processed (inactive ones too, otherwise
-- re-activating one later would pay the old 10x value).
UPDATE public.battle_pass_missions
SET
  reward_duelcoins = CASE
    WHEN reward_duelcoins > 0 THEN GREATEST(1, ROUND(reward_duelcoins / 10.0))::integer
    ELSE reward_duelcoins
  END,
  rewards_reduced_10x = true
WHERE rewards_reduced_10x = false;

-- Level rewards: every row not yet processed is marked (so a cosmetic reward
-- later switched to 'duelcoins' on the new scale is never divided), but only
-- 'duelcoins' rows have amount/title changed.
UPDATE public.battle_pass_rewards
SET
  amount = CASE
    WHEN reward_type = 'duelcoins' AND amount > 0 THEN GREATEST(1, ROUND(amount / 10.0))::integer
    ELSE amount
  END,
  title = CASE
    WHEN reward_type = 'duelcoins' AND amount > 0 AND title ~ '^\d+ DuelCoins$'
      THEN GREATEST(1, ROUND(amount / 10.0))::integer::text || ' DuelCoins'
    ELSE title
  END,
  rewards_reduced_10x = true
WHERE rewards_reduced_10x = false;

-- From now on, new rows are born on the new scale.
ALTER TABLE public.battle_pass_missions ALTER COLUMN rewards_reduced_10x SET DEFAULT true;
ALTER TABLE public.battle_pass_rewards  ALTER COLUMN rewards_reduced_10x SET DEFAULT true;

COMMENT ON COLUMN public.battle_pass_missions.rewards_reduced_10x IS
  'true = reward_duelcoins already on the post-20261005103000 scale (divided by 10 or created afterwards)';
COMMENT ON COLUMN public.battle_pass_rewards.rewards_reduced_10x IS
  'true = amount already on the post-20261005103000 scale (divided by 10 or created afterwards)';
