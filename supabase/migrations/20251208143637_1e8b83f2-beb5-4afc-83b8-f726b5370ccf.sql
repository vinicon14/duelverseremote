-- Adicionar política para permitir atualização de views por qualquer usuário autenticado em vídeos públicos
CREATE POLICY "Anyone can increment views on public recordings" 
ON public.match_recordings 
FOR UPDATE 
USING (is_public = true)
WITH CHECK (is_public = true);

-- Criar função para incrementar views de forma segura
CREATE OR REPLACE FUNCTION public.increment_video_views(video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE match_recordings 
  SET views = COALESCE(views, 0) + 1 
  WHERE id = video_id AND is_public = true;
END;
$$;