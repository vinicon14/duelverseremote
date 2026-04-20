-- Remover duelos onde o mesmo usuário é player1 e player2
DELETE FROM live_duels
WHERE player1_id = player2_id AND player2_id IS NOT NULL;

-- Adicionar índice para melhorar performance na busca de duelos ativos por usuário
CREATE INDEX IF NOT EXISTS idx_live_duels_active_players 
ON live_duels(player1_id, player2_id, status) 
WHERE status IN ('waiting', 'active');