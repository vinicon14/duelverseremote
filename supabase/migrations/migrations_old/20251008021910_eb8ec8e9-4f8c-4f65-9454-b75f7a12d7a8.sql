-- Excluir salas em andamento com apenas 1 jogador
DELETE FROM live_duels 
WHERE status IN ('waiting', 'in_progress') 
AND opponent_id IS NULL;

-- Habilitar extensões necessárias para cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Criar função para limpar salas antigas sem usuários
CREATE OR REPLACE FUNCTION cleanup_empty_duels()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Deletar salas em 'waiting' criadas há mais de 3 minutos sem oponente
  DELETE FROM live_duels
  WHERE status = 'waiting'
    AND opponent_id IS NULL
    AND created_at < NOW() - INTERVAL '3 minutes';
    
  -- Deletar salas em 'in_progress' iniciadas há mais de 3 minutos com apenas 1 jogador
  DELETE FROM live_duels
  WHERE status = 'in_progress'
    AND opponent_id IS NULL
    AND started_at < NOW() - INTERVAL '3 minutes';
END;
$$;

-- Agendar limpeza automática a cada minuto
SELECT cron.schedule(
  'cleanup-empty-duels',
  '* * * * *',
  $$SELECT cleanup_empty_duels()$$
);