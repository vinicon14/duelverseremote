-- Garantir que cada usuário só pode se inscrever uma vez por torneio
ALTER TABLE tournament_participants DROP CONSTRAINT IF EXISTS tournament_participants_tournament_user_unique;
ALTER TABLE tournament_participants ADD CONSTRAINT tournament_participants_tournament_user_unique UNIQUE (tournament_id, user_id);

-- Adicionar índice para melhor performance nas consultas
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_id ON tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_user_id ON tournament_participants(user_id);

-- Garantir que tournament_matches tem índices adequados
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_id ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(tournament_id, round);