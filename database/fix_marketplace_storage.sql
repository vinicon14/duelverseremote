-- ============================================================================
-- Corrigir bucket de imagens do marketplace e criar políticas de acesso
-- Execute no Supabase SQL Editor
-- ============================================================================

-- 1. Criar bucket se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketplace-images', 'marketplace-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Remover políticas antigas (se existirem)
DROP POLICY IF EXISTS "Admin upload marketplace images" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete marketplace images" ON storage.objects;
DROP POLICY IF EXISTS "Admin update marketplace images" ON storage.objects;
DROP POLICY IF EXISTS "Public read marketplace images" ON storage.objects;

-- 3. Criar função is_admin se não existir
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = user_id AND role = 'admin'
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

-- 4. Criar políticas de acesso
-- Admin pode fazer upload
CREATE POLICY "Admin upload marketplace images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'marketplace-images' AND
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Admin pode deletar
CREATE POLICY "Admin delete marketplace images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'marketplace-images' AND
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Admin pode atualizar
CREATE POLICY "Admin update marketplace images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'marketplace-images' AND
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Todos podem ler (imagens públicas)
CREATE POLICY "Public read marketplace images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'marketplace-images');
