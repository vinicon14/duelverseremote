-- Garantir que RLS está habilitado na tabela match_recordings
ALTER TABLE public.match_recordings ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Users can view own recordings and public recordings" ON public.match_recordings;
DROP POLICY IF EXISTS "Anyone can view public recordings" ON public.match_recordings;

-- Criar política para visualização de vídeos públicos (sem autenticação necessária)
CREATE POLICY "Public recordings are viewable by everyone"
ON public.match_recordings
FOR SELECT
USING (is_public = true);

-- Criar política para visualização de vídeos privados (apenas o dono)
CREATE POLICY "Users can view their own private recordings"
ON public.match_recordings
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);