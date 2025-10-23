-- Corrigir a função para incluir search_path
CREATE OR REPLACE FUNCTION cleanup_empty_duels()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Mover extensões para o schema correto
DROP EXTENSION IF EXISTS pg_cron;
DROP EXTENSION IF EXISTS pg_net;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Recriar o cron job
SELECT cron.schedule(
  'cleanup-empty-duels',
  '* * * * *',
  $$SELECT cleanup_empty_duels()$$
);