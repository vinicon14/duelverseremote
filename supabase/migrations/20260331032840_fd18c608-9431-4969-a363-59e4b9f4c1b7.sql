
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ringtones', 'ringtones', true, 20971520, ARRAY['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'video/mp4', 'audio/x-m4a', 'audio/aac'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view ringtones" ON storage.objects FOR SELECT USING (bucket_id = 'ringtones');
CREATE POLICY "Admins can upload ringtones" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'ringtones' AND is_admin(auth.uid()));
CREATE POLICY "Admins can update ringtones" ON storage.objects FOR UPDATE USING (bucket_id = 'ringtones' AND is_admin(auth.uid()));
CREATE POLICY "Admins can delete ringtones" ON storage.objects FOR DELETE USING (bucket_id = 'ringtones' AND is_admin(auth.uid()));
