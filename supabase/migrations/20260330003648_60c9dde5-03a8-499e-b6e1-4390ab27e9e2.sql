INSERT INTO storage.buckets (id, name, public)
VALUES ('app-downloads', 'app-downloads', true)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public;

DROP POLICY IF EXISTS "Public can read app downloads" ON storage.objects;
CREATE POLICY "Public can read app downloads"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'app-downloads');

DROP POLICY IF EXISTS "Admins can upload app downloads" ON storage.objects;
CREATE POLICY "Admins can upload app downloads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'app-downloads'
  AND public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Admins can update app downloads" ON storage.objects;
CREATE POLICY "Admins can update app downloads"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'app-downloads'
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  bucket_id = 'app-downloads'
  AND public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Admins can delete app downloads" ON storage.objects;
CREATE POLICY "Admins can delete app downloads"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'app-downloads'
  AND public.has_role(auth.uid(), 'admin')
);