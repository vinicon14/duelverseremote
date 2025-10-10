-- Adicionar coluna de duração personalizada (em minutos)
ALTER TABLE public.live_duels 
ADD COLUMN duration_minutes integer NOT NULL DEFAULT 60;

COMMENT ON COLUMN public.live_duels.duration_minutes IS 'Duração da partida em minutos, definida pelo criador';