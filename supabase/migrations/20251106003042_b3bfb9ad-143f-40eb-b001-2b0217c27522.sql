-- Adicionar coluna is_public para controlar compartilhamento de gravações
ALTER TABLE public.match_recordings 
ADD COLUMN is_public boolean NOT NULL DEFAULT false;

-- Atualizar policy de visualização para mostrar apenas gravações próprias ou públicas
DROP POLICY IF EXISTS "Recordings are viewable by everyone" ON public.match_recordings;

CREATE POLICY "Users can view own recordings and public recordings" 
ON public.match_recordings 
FOR SELECT 
USING (
  auth.uid() = user_id OR is_public = true
);