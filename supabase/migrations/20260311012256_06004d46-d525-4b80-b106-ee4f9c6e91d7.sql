
-- Create marketplace-images storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketplace-images', 'marketplace-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow admins to upload images
CREATE POLICY "Admins can upload marketplace images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'marketplace-images' AND
  public.is_admin(auth.uid())
);

-- Allow admins to update images
CREATE POLICY "Admins can update marketplace images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'marketplace-images' AND
  public.is_admin(auth.uid())
);

-- Allow admins to delete images
CREATE POLICY "Admins can delete marketplace images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'marketplace-images' AND
  public.is_admin(auth.uid())
);

-- Allow public to view marketplace images
CREATE POLICY "Anyone can view marketplace images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'marketplace-images');
