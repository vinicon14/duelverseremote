-- Excluir todos os duelos ativos
DELETE FROM live_duels WHERE status IN ('waiting', 'in_progress');