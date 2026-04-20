-- Create storage bucket for plan images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('plan-images', 'plan-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Storage policy for plan-images (public read)
CREATE POLICY "Public Access plan-images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'plan-images');

-- Storage policy for authenticated users to upload
CREATE POLICY "Authenticated users can upload plan-images"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'plan-images' AND auth.role() = 'authenticated');

-- Storage policy for authenticated users to delete their own uploads
CREATE POLICY "Authenticated users can delete plan-images"
ON storage.objects
FOR DELETE
USING (bucket_id = 'plan-images' AND auth.role() = 'authenticated');

-- Storage policy for admins to manage
CREATE POLICY "Admins can manage plan-images"
ON storage.objects
FOR ALL
USING (
  bucket_id = 'plan-images' 
  AND EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);
