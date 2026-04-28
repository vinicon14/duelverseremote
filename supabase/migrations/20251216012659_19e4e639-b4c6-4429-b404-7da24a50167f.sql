-- Criar função para sincronizar arquivos do storage com a tabela match_recordings
CREATE OR REPLACE FUNCTION public.sync_storage_recordings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  -- Inserir registros para arquivos que existem no storage mas não na tabela
  INSERT INTO public.match_recordings (user_id, video_url, title, is_public, file_size, created_at)
  SELECT 
    o.owner_id::uuid as user_id,
    'https://xxttwzewtqxvpgefggah.supabase.co/storage/v1/object/public/match-recordings/' || o.name as video_url,
    'Gravação ' || to_char(o.created_at, 'DD/MM/YYYY HH24:MI') as title,
    false as is_public,
    COALESCE((o.metadata->>'size')::bigint, 0) as file_size,
    o.created_at
  FROM storage.objects o
  WHERE o.bucket_id = 'match-recordings'
    AND o.owner_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.match_recordings mr 
      WHERE mr.video_url LIKE '%' || o.name
    );
END;
$$;

-- Dar permissão para usuários autenticados executarem a função
GRANT EXECUTE ON FUNCTION public.sync_storage_recordings() TO authenticated;