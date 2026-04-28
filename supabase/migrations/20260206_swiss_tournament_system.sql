-- ====================================
-- SISTEMA DE TORNEIO SUÍÇO
-- ====================================

-- 1. Função para gerar matches de torneio suíço
CREATE OR REPLACE FUNCTION public.generate_swiss_matches(
  p_tournament_id UUID,
  p_round INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament RECORD;
  v_participants RECORD[];
  v_standings TABLE (
    user_id UUID,
    username TEXT,
    wins INTEGER,
    losses INTEGER,
    score FLOAT
  );
  v_matches_created INTEGER := 0;
  v_participant RECORD;
  v_paired_users UUID[];
  v_player1_id UUID;
  v_player2_id UUID;
BEGIN
  -- Validar torneio
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id AND tournament_type = 'swiss';
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Torneio suíço não encontrado');
  END IF;

  -- Buscar rankings da rodada anterior (ou inicial)
  INSERT INTO v_standings
  SELECT 
    tp.user_id,
    p.username,
    tp.wins,
    tp.losses,
    (tp.wins * 3.0) as score
  FROM tournament_participants tp
  JOIN profiles p ON p.user_id = tp.user_id
  WHERE tp.tournament_id = p_tournament_id
  AND tp.status = 'active'
  ORDER BY score DESC, tp.wins DESC;

  -- Gerar matches emparelhados (Swiss pairing)
  v_paired_users := ARRAY[]::UUID[];
  
  FOR v_participant IN
    SELECT * FROM v_standings
  LOOP
    IF v_participant.user_id = ANY(v_paired_users) THEN
      CONTINUE;
    END IF;
    
    v_player1_id := v_participant.user_id;
    v_paired_users := array_append(v_paired_users, v_player1_id);
    
    -- Encontrar próximo player não pareado com score similar
    SELECT user_id INTO v_player2_id
    FROM v_standings
    WHERE user_id != v_player1_id
    AND NOT user_id = ANY(v_paired_users)
    ORDER BY score DESC, wins DESC
    LIMIT 1;
    
    IF v_player2_id IS NOT NULL THEN
      v_paired_users := array_append(v_paired_users, v_player2_id);
      
      -- Criar match
      INSERT INTO tournament_matches (
        tournament_id,
        round_number,
        player1_id,
        player2_id,
        status
      ) VALUES (
        p_tournament_id,
        p_round,
        v_player1_id,
        v_player2_id,
        'pending'
      );
      
      v_matches_created := v_matches_created + 1;
    END IF;
  END LOOP;

  -- Atualizar current_round do torneio
  UPDATE tournaments
  SET current_round = p_round,
      updated_at = now()
  WHERE id = p_tournament_id;

  RETURN json_build_object(
    'success', true,
    'message', format('Rodada %s iniciada com %s partidas', p_round, v_matches_created),
    'matches_created', v_matches_created
  );
END;
$$;

-- 2. Função para avançar top 4 para eliminatória
CREATE OR REPLACE FUNCTION public.advance_to_top4(
  p_tournament_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament RECORD;
  v_top4 UUID[];
  v_match_id UUID;
BEGIN
  -- Validar que é torneio suíço
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id AND tournament_type = 'swiss';
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Torneio suíço não encontrado');
  END IF;

  -- Obter top 4 jogadores por pontuação
  SELECT ARRAY_AGG(user_id ORDER BY wins DESC, id DESC) INTO v_top4
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id
  AND status = 'active'
  LIMIT 4;

  IF array_length(v_top4, 1) < 4 THEN
    RETURN json_build_object('success', false, 'message', 'Menos de 4 jogadores para top 4');
  END IF;

  -- Gerar semifinais (Top 4)
  -- Semifinal 1: 1º vs 4º
  -- Semifinal 2: 2º vs 3º
  
  INSERT INTO tournament_matches (tournament_id, round_number, player1_id, player2_id, status)
  VALUES 
    (p_tournament_id, v_tournament.total_rounds + 1, v_top4[1], v_top4[4], 'pending'),
    (p_tournament_id, v_tournament.total_rounds + 1, v_top4[2], v_top4[3], 'pending');

  -- Atualizar torneio para fase eliminatória
  UPDATE tournaments
  SET current_round = v_tournament.total_rounds + 1,
      status = 'semifinal',
      updated_at = now()
  WHERE id = p_tournament_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Top 4 avançados para semifinais',
    'top4_players', v_top4
  );
END;
$$;

-- 3. Função para gerar finais
CREATE OR REPLACE FUNCTION public.generate_finals(
  p_tournament_id UUID,
  p_semifinal1_winner UUID,
  p_semifinal2_winner UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament RECORD;
BEGIN
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id;

  -- Criar final
  INSERT INTO tournament_matches (
    tournament_id,
    round_number,
    player1_id,
    player2_id,
    status
  ) VALUES (
    p_tournament_id,
    v_tournament.total_rounds + 2,
    p_semifinal1_winner,
    p_semifinal2_winner,
    'pending'
  );

  RETURN json_build_object(
    'success', true,
    'message', 'Final gerada com sucesso'
  );
END;
$$;

-- 4. Atualizar índices para melhor performance em torneios suíços
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_score 
ON tournament_participants(tournament_id, wins DESC, losses DESC);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_round 
ON tournament_matches(tournament_id, round_number);
