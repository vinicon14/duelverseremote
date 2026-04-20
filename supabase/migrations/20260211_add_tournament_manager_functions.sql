-- Migração: Adicionar funções RPC necessárias para o Gerenciador de Torneios
-- Data: 2026-02-11

-- Função para buscar torneios criados pelo usuário atual
CREATE OR REPLACE FUNCTION public.get_my_created_tournaments()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  IF v_user_id IS NULL THEN
    RETURN '[]'::JSON;
  END IF;
  
  RETURN (
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'id', t.id,
          'name', t.name,
          'description', t.description,
          'status', t.status,
          'is_weekly', COALESCE(t.is_weekly, false),
          'start_date', t.start_date,
          'end_date', t.end_date,
          'prize_pool', COALESCE(t.prize_pool, 0),
          'entry_fee', COALESCE(t.entry_fee, 0),
          'current_round', COALESCE(t.current_round, 0),
          'total_rounds', t.total_rounds,
          'created_at', t.created_at,
          'participant_count', (
            SELECT COUNT(*) FROM tournament_participants tp 
            WHERE tp.tournament_id = t.id
          ),
          'total_collected', (
            SELECT COALESCE(SUM(amount), 0) 
            FROM duelcoins_transactions dt
            WHERE dt.tournament_id = t.id 
            AND dt.transaction_type = 'tournament_entry'
          ),
          'prize_paid', EXISTS (
            SELECT 1 FROM duelcoins_transactions dt
            WHERE dt.tournament_id = t.id 
            AND dt.transaction_type = 'tournament_prize'
          )
        )
        ORDER BY t.created_at DESC
      ),
      '[]'::JSON
    )
    FROM tournaments t
    WHERE t.created_by = v_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para buscar participantes de um torneio
CREATE OR REPLACE FUNCTION public.get_tournament_participants(p_tournament_id UUID)
RETURNS JSON AS $$
BEGIN
  IF p_tournament_id IS NULL THEN
    RETURN '[]'::JSON;
  END IF;
  
  RETURN (
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'user_id', tp.user_id,
          'username', p.username,
          'avatar_url', p.avatar_url,
          'is_online', p.is_online,
          'joined_at', tp.registered_at,
          'status', tp.status,
          'wins', COALESCE(tp.wins, 0),
          'losses', COALESCE(tp.losses, 0),
          'score', COALESCE(tp.score, 0)
        )
        ORDER BY tp.registered_at ASC
      ),
      '[]'::JSON
    )
    FROM tournament_participants tp
    LEFT JOIN profiles p ON p.user_id = tp.user_id
    WHERE tp.tournament_id = p_tournament_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Conceder permissões para usuários autenticados
GRANT EXECUTE ON FUNCTION public.get_my_created_tournaments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tournament_participants(UUID) TO authenticated;

-- Comentários
COMMENT ON FUNCTION public.get_my_created_tournaments() IS 'Retorna todos os torneios criados pelo usuário atual com estatísticas';
COMMENT ON FUNCTION public.get_tournament_participants(UUID) IS 'Retorna todos os participantes de um torneio específico';
