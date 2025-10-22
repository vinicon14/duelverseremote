-- Primeiro, remover duelos onde o mesmo usuário é player1 e player2
DELETE FROM live_duels
WHERE player1_id = player2_id AND player2_id IS NOT NULL;

-- Adicionar constraint para garantir que player1 e player2 sejam diferentes
ALTER TABLE live_duels
ADD CONSTRAINT different_players_check 
CHECK (player1_id != player2_id OR player2_id IS NULL);

-- Adicionar índice para melhorar performance na busca de duelos ativos por usuário
CREATE INDEX IF NOT EXISTS idx_live_duels_active_players 
ON live_duels(player1_id, player2_id, status) 
WHERE status IN ('waiting', 'active');