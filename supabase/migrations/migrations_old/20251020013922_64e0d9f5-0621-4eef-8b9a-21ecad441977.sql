-- Criar função para limpar filas automaticamente
CREATE OR REPLACE FUNCTION cleanup_matchmaking_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deletar entradas expiradas
  DELETE FROM matchmaking_queue
  WHERE expires_at < NOW();
  
  -- Deletar entradas matched antigas (mais de 5 minutos)
  DELETE FROM matchmaking_queue
  WHERE status = 'matched' 
    AND joined_at < NOW() - INTERVAL '5 minutes';
    
  -- Deletar entradas waiting antigas (mais de 2 minutos, caso o expires_at falhe)
  DELETE FROM matchmaking_queue
  WHERE status = 'waiting' 
    AND joined_at < NOW() - INTERVAL '2 minutes';
END;
$$;

-- Agendar limpeza a cada 30 segundos
SELECT cron.schedule(
  'cleanup-matchmaking-queue',
  '*/30 * * * * *',
  'SELECT cleanup_matchmaking_queue();'
);