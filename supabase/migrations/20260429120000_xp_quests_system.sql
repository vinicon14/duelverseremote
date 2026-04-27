-- XP and Quests System for DuelVerse
-- Adds missions, ads watched counter, and ranked XP betting

-- 1. Add ads_watched counter to tcg_profiles
ALTER TABLE tcg_profiles ADD COLUMN IF NOT EXISTS ads_watched INTEGER DEFAULT 0;
ALTER TABLE tcg_profiles ADD COLUMN IF NOT EXISTS daily_login TIMESTAMPTZ;
ALTER TABLE tcg_profiles ADD COLUMN IF NOT EXISTS last_daily_claim TIMESTAMPTZ;

-- 2. Create quests table
CREATE TABLE IF NOT EXISTS quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tcg_type TEXT NOT NULL,
  quest_type TEXT NOT NULL, -- 'daily_login', 'play_casual', 'play_ranked', 'watch_ad', 'forum_post'
  progress INTEGER DEFAULT 0,
  target INTEGER NOT NULL,
  reward_xp INTEGER NOT NULL,
  claimed BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tcg_type, quest_type)
);

-- 3. Create ranked XP bets tracking
CREATE TABLE IF NOT EXISTS ranked_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tcg_type TEXT NOT NULL,
  difficulty TEXT NOT NULL, -- 'easy', 'medium', 'hard', 'extreme', 'insane'
  xp_bet INTEGER NOT NULL,
  xp_won INTEGER DEFAULT 0,
  result TEXT, -- 'win', 'loss', 'pending'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create function to claim daily XP
CREATE OR REPLACE FUNCTION claim_daily_xp(p_user_id UUID, p_tcg_type TEXT)
RETURNS JSONB AS $$
DECLARE
  v_xp INTEGER := 5;
  v_profile RECORD;
BEGIN
  -- Get profile
  SELECT * INTO v_profile FROM tcg_profiles 
  WHERE user_id = p_user_id AND tcg_type = p_tcg_type 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build('success', false, 'message', 'Perfil não encontrado');
  END IF;
  
  -- Check if already claimed today
  IF v_profile.last_daily_claim IS NOT NULL 
     AND DATE(v_profile.last_daily_claim) = DATE(NOW()) THEN
    RETURN jsonb_build('success', false, 'message', 'Recompensa diária já coletada');
  END IF;
  
  -- Update profile
  UPDATE tcg_profiles SET 
    points = points + v_xp,
    last_daily_claim = NOW()
  WHERE user_id = p_user_id AND tcg_type = p_tcg_type;
  
  RETURN jsonb_build('success', true, 'xp_earned', v_xp, 'message', 'XP diário coletado!');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create function to complete quest
CREATE OR REPLACE FUNCTION complete_quest(p_user_id UUID, p_tcg_type TEXT, p_quest_type TEXT)
RETURNS JSONB AS $$
DECLARE
  v_quest RECORD;
  v_xp INTEGER;
BEGIN
  SELECT * INTO v_quest FROM quests 
  WHERE user_id = p_user_id AND tcg_type = p_tcg_type AND quest_type = p_quest_type AND NOT claimed
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build('success', false, 'message', 'Quest não encontrada');
  END IF;
  
  -- Update progress
  UPDATE quests SET progress = progress + 1
  WHERE id = v_quest.id;
  
  -- Check if completed
  IF v_quest.progress + 1 >= v_quest.target THEN
    UPDATE quests SET claimed = TRUE, progress = progress + 1
    WHERE id = v_quest.id;
    
    -- Award XP
    UPDATE tcg_profiles SET points = points + v_quest.reward_xp
    WHERE user_id = p_user_id AND tcg_type = p_tcg_type;
    
    v_xp := v_quest.reward_xp;
  ELSE
    v_xp := 0;
  END IF;
  
  RETURN jsonb_build('success', true, 'xp_earned', v_xp, 'progress', v_quest.progress + 1, 'target', v_quest.target);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create function to place ranked bet
CREATE OR REPLACE FUNCTION place_ranked_bet(p_user_id UUID, p_tcg_type TEXT, p_difficulty TEXT, p_xp_bet INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_difficulty_xp INTEGER;
  v_profile RECORD;
  v_bet_level TEXT;
BEGIN
  -- Map difficulty to XP
  v_difficulty_xp := CASE p_difficulty 
    WHEN 'easy' THEN 5
    WHEN 'medium' THEN 20
    WHEN 'hard' THEN 30
    WHEN 'extreme' THEN 50
    WHEN 'insane' THEN 1000
    ELSE 5
  END;
  
  -- Validate bet
  IF p_xp_bet < v_difficulty_xp THEN
    RETURN jsonb_build('success', false, 'message', 'XP insuficiente para esta dificuldade');
  END IF;
  
  -- Get profile
  SELECT * INTO v_profile FROM tcg_profiles 
  WHERE user_id = p_user_id AND tcg_type = p_tcg_type 
  FOR UPDATE;
  
  IF v_profile.points < p_xp_bet THEN
    RETURN jsonb_build('success', false, 'message', 'XP insuficiente');
  END IF;
  
  -- Deduct XP bet
  UPDATE tcg_profiles SET points = points - p_xp_bet
  WHERE user_id = p_user_id AND tcg_type = p_tcg_type;
  
  -- Create bet record
  INSERT INTO ranked_bets (user_id, tcg_type, difficulty, xp_bet, result)
  VALUES (p_user_id, p_tcg_type, p_difficulty, p_xp_bet, 'pending');
  
  RETURN jsonb_build('success', true, 'xp_bet', p_xp_bet, 'difficulty', p_difficulty, 'message', 'Aposta realizada!');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create function to resolve ranked bet
CREATE OR REPLACE FUNCTION resolve_ranked_bet(p_user_id UUID, p_tcg_type TEXT, p_difficulty TEXT, p_won BOOLEAN)
RETURNS INTEGER AS $$
DECLARE
  v_bet RECORD;
  v_xp_won INTEGER;
BEGIN
  -- Get pending bet
  SELECT * INTO v_bet FROM ranked_bets 
  WHERE user_id = p_user_id AND tcg_type = p_tcg_type AND difficulty = p_difficulty AND result = 'pending'
  ORDER BY created_at DESC LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Calculate winnings
  IF p_won THEN
    v_xp_won := v_bet.xp_bet * 2; -- Double the bet
  ELSE
    v_xp_won := 0;
  END IF;
  
  -- Update bet
  UPDATE ranked_bets SET result = CASE WHEN p_won THEN 'win' ELSE 'loss' END, xp_won = v_xp_won
  WHERE id = v_bet.id;
  
  -- Award XP if won
  IF p_won THEN
    UPDATE tcg_profiles SET points = points + v_xp_won, wins = wins + 1
    WHERE user_id = p_user_id AND tcg_type = p_tcg_type;
  ELSE
    UPDATE tcg_profiles SET losses = losses + 1
    WHERE user_id = p_user_id AND tcg_type = p_tcg_type;
  END IF;
  
  RETURN v_xp_won;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Daily quests generation trigger
CREATE OR REPLACE FUNCTION generate_daily_quests()
RETURNS void AS $$
BEGIN
  -- Create quests for all users (simplified - in production, run per user)
  INSERT INTO quests (user_id, tcg_type, quest_type, target, reward_xp, expires_at)
  SELECT 
    user_id, 'yugioh', quest_type, 1, reward_xp, NOW() + INTERVAL '1 day'
  FROM (
    VALUES 
      ('daily_login', 5),
      ('play_casual', 10),
      ('play_ranked', 20),
      ('watch_ad', 100)
  ) AS q(quest_type, reward_xp)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL ON quests TO anon, authenticated;
GRANT ALL ON ranked_bets TO anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_daily_xp TO anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_quest TO anon, authenticated;
GRANT EXECUTE ON FUNCTION place_ranked_bet TO anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_ranked_bet TO anon, authenticated;