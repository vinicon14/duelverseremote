-- Criar tabela para partidas de torneio
CREATE TABLE IF NOT EXISTS tournament_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  player1_id UUID REFERENCES profiles(user_id),
  player2_id UUID REFERENCES profiles(user_id),
  winner_id UUID REFERENCES profiles(user_id),
  duel_id UUID REFERENCES live_duels(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_tournament_matches_tournament ON tournament_matches(tournament_id);
CREATE INDEX idx_tournament_matches_players ON tournament_matches(player1_id, player2_id);
CREATE INDEX idx_tournament_matches_status ON tournament_matches(tournament_id, status);

-- RLS policies
ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view tournament matches"
  ON tournament_matches FOR SELECT
  USING (true);

CREATE POLICY "System can manage tournament matches"
  ON tournament_matches FOR ALL
  USING (true)
  WITH CHECK (true);

-- Adicionar realtime para tournament_matches
ALTER TABLE tournament_matches REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE tournament_matches;