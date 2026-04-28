-- Mantém todas as salas de duelo abertas, exceto as finalizadas.
-- 1) Neutraliza a função cleanup_empty_duels (vira no-op)
CREATE OR REPLACE FUNCTION public.cleanup_empty_duels()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Intencionalmente vazio: salas vazias não são mais removidas automaticamente.
  -- Apenas duelos com status = 'finished' devem ser removidos manualmente.
  RETURN;
END;
$function$;

-- 2) Remove o cron job que executava a limpeza periódica (se existir)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-empty-duels');
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Job pode já estar removido; ignorar
  NULL;
END $$;