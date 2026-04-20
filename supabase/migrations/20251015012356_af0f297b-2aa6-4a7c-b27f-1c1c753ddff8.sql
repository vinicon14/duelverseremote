-- Criar edge function trigger para auto-limpeza de salas vazias
-- Atualizar função de limpeza para remover salas vazias após 3 minutos
CREATE OR REPLACE FUNCTION public.cleanup_empty_duels()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Deletar salas em 'waiting' criadas há mais de 3 minutos sem opponent
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
$function$;