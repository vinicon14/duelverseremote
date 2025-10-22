-- Criar bucket para imagens de notícias
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'news-media',
  'news-media',
  true,
  52428800, -- 50MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
);

-- Criar bucket para imagens de anúncios
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ads-media',
  'ads-media',
  true,
  52428800, -- 50MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
);

-- Políticas RLS para news-media bucket
CREATE POLICY "Public can view news media"
ON storage.objects FOR SELECT
USING (bucket_id = 'news-media');

CREATE POLICY "Admins can upload news media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'news-media' AND
  is_admin(auth.uid())
);

CREATE POLICY "Admins can update news media"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'news-media' AND
  is_admin(auth.uid())
);

CREATE POLICY "Admins can delete news media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'news-media' AND
  is_admin(auth.uid())
);

-- Políticas RLS para ads-media bucket
CREATE POLICY "Public can view ads media"
ON storage.objects FOR SELECT
USING (bucket_id = 'ads-media');

CREATE POLICY "Admins can upload ads media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'ads-media' AND
  is_admin(auth.uid())
);

CREATE POLICY "Admins can update ads media"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'ads-media' AND
  is_admin(auth.uid())
);

CREATE POLICY "Admins can delete ads media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'ads-media' AND
  is_admin(auth.uid())
);