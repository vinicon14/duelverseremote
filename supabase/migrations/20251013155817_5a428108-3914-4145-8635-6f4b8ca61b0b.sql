-- 1. Alterar tempo padrão de duelo para 50 minutos
ALTER TABLE public.live_duels 
ALTER COLUMN duration_minutes SET DEFAULT 50;

-- 2. Adicionar colunas para controle de pausa do timer
ALTER TABLE public.live_duels 
ADD COLUMN is_timer_paused boolean NOT NULL DEFAULT false,
ADD COLUMN remaining_seconds integer;

-- Atualizar a política de SELECT para permitir que qualquer usuário autenticado veja duelos (espectadores)
DROP POLICY IF EXISTS "All view live duels" ON public.live_duels;
CREATE POLICY "Authenticated users view live duels" 
ON public.live_duels 
FOR SELECT 
TO authenticated
USING (true);