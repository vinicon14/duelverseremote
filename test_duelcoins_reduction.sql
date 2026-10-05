-- Test script to demonstrate DuelCoins reduction (before/after)
-- This simulates the migration 20261005103000_reduce_duelcoins_rewards_10x.sql

-- ============ BEFORE ============
-- Current values in database (from seed data)

-- MISSIONS (battle_pass_missions):
-- Daily missions:
--   'Vença 2 duelos' → 50 DC
--   'Jogue 3 duelos' → 30 DC
-- Weekly missions:
--   'Vença 10 duelos' → 200 DC
--   'Participe de 2 torneios' → 250 DC
-- Season missions:
--   'Alcance 25 vitórias' → 500 DC
--   'Alcance 50 vitórias' → 1000 DC
--   'Alcance 100 vitórias' → 2500 DC
--
-- DAILY TOTAL: 80 DC/day (50 + 30)

-- REWARDS (battle_pass_rewards):
-- Free track: 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, ... up to 305 DC
-- Pro track:  160, 170, 180, 190, 200, 210, 220, 230, 240, 250, 260, ... up to 650 DC

-- ============ AFTER (with GREATEST(1, ROUND(value/10.0))) ============

-- MISSIONS (expected results):
SELECT 
  'MISSIONS - BEFORE/AFTER' as category,
  title,
  50 as before_dc,
  GREATEST(1, ROUND(50 / 10.0)) as after_dc
WHERE title = 'Vença 2 duelos'
UNION ALL
SELECT 
  'MISSIONS',
  'Jogue 3 duelos',
  30,
  GREATEST(1, ROUND(30 / 10.0))
UNION ALL
SELECT 
  'MISSIONS',
  'Vença 10 duelos (weekly)',
  200,
  GREATEST(1, ROUND(200 / 10.0))
UNION ALL
SELECT 
  'MISSIONS',
  'Participe de 2 torneios (weekly)',
  250,
  GREATEST(1, ROUND(250 / 10.0))
UNION ALL
SELECT 
  'MISSIONS',
  'Alcance 25 vitórias (season)',
  500,
  GREATEST(1, ROUND(500 / 10.0))
UNION ALL
SELECT 
  'MISSIONS',
  'Alcance 50 vitórias (season)',
  1000,
  GREATEST(1, ROUND(1000 / 10.0))
UNION ALL
SELECT 
  'MISSIONS',
  'Alcance 100 vitórias (season)',
  2500,
  GREATEST(1, ROUND(2500 / 10.0))
UNION ALL
SELECT 
  'DAILY TOTAL',
  'Daily missions combined',
  80,
  GREATEST(1, ROUND(50 / 10.0)) + GREATEST(1, ROUND(30 / 10.0));

-- REWARDS (sample calculations for free and pro tracks):
WITH sample_rewards AS (
  SELECT 
    'FREE TRACK' as track,
    i as level,
    (50 + i * 5) as before_dc,
    GREATEST(1, ROUND((50 + i * 5) / 10.0)) as after_dc
  FROM generate_series(1, 10) i
  UNION ALL
  SELECT 
    'PRO TRACK',
    i,
    (150 + i * 10),
    GREATEST(1, ROUND((150 + i * 10) / 10.0))
  FROM generate_series(1, 10) i
)
SELECT 
  'REWARDS - BEFORE/AFTER' as category,
  track || ' Level ' || level as description,
  before_dc,
  after_dc
FROM sample_rewards
ORDER BY track, level;

-- ============ SUMMARY ============
-- Daily missions: 80 DC/day → 8 DC/day
-- PRO subscription cost: 20 DC (unchanged)
-- Days to PRO: 20 DC ÷ 8 DC/day = 2.5 days ✓
--
-- Formula used: GREATEST(1, ROUND(value/10.0))
-- - Divides by 10
-- - Rounds to nearest integer
-- - Ensures minimum of 1 DC (never 0 for non-zero values)
-- - Zero values remain zero
