-- Atualizar função de limpeza para salas vazias com timeout de 3 minutos
-- A contagem reinicia quando alguém entra na sala

-- Adicionar coluna empty_since para rastrear quando a sala ficou vazia
ALTER TABLE live_duels ADD COLUMN IF NOT EXISTS empty_since TIMESTAMPTZ NULL;

-- Criar ou substituir a função de limpeza
CREATE OR REPLACE FUNCTION public.cleanup_empty_duels()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted_count INTEGER := 0;
BEGIN
  -- Deletar salas em 'waiting' criadas há mais de 3 minutos sem opponent
  DELETE FROM live_duels
  WHERE status = 'waiting'
    AND opponent_id IS NULL
    AND created_at < NOW() - INTERVAL '3 minutes';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  -- Deletar salas em 'in_progress' que estão vazias há mais de 3 minutos
  -- Usar empty_since se existir, senão usar started_at ou created_at
  DELETE FROM live_duels
  WHERE status = 'in_progress'
    AND opponent_id IS NULL
    AND (
      -- Se empty_since existe e tem mais de 3 minutos
      (empty_since IS NOT NULL AND empty_since < NOW() - INTERVAL '3 minutes')
      -- Fallback: se empty_since não existe, usar started_at
      OR (
        empty_since IS NULL 
        AND (
          (started_at IS NOT NULL AND started_at < NOW() - INTERVAL '3 minutes')
          OR (started_at IS NULL AND created_at < NOW() - INTERVAL '3 minutes')
        )
      )
    );
  
  GET DIAGNOSTICS v_deleted_count = v_deleted_count + ROW_COUNT;
  
  RAISE NOTICE 'Cleanup: % salas vazias removidas', v_deleted_count;
END;
$function$;

-- Trigger para atualizar empty_status quando opponent_id muda
CREATE OR REPLACE FUNCTION public.handle_opponent_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Se opponent foi adicionado (era NULL e agora não é), resetar empty_since
  IF (OLD.opponent_id IS NULL AND NEW.opponent_id IS NOT NULL) THEN
    NEW.empty_since = NULL;
  -- Se opponent foi removido, definir empty_since
  ELSIF (OLD.opponent_id IS NOT NULL AND NEW.opponent_id IS NULL) THEN
    NEW.empty_since = NOW();
  END IF;
  RETURN NEW;
END;
$function$;

-- Criar trigger se não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_handle_opponent_change') THEN
        CREATE TRIGGER trg_handle_opponent_change
        BEFORE UPDATE OF opponent_id ON live_duels
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_opponent_change();
    END IF;
END $$;

-- Criar índice para melhorar performance da limpeza
CREATE INDEX IF NOT EXISTS idx_live_duels_empty_since 
ON live_duels(empty_since) WHERE status = 'in_progress' AND opponent_id IS NULL;
