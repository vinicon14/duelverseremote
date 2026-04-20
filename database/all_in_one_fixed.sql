-- ============================================================================
-- SQL COMPLETO PARA CORRIGIR O MARKETPLACE (corrigido)
-- Copie e cole todo este código no Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. CRIAR TABELA USER_INVENTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.marketplace_products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_inventory_user_id ON public.user_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_inventory_product_id ON public.user_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_user_inventory_is_used ON public.user_inventory(is_used);

ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own inventory" ON public.user_inventory;
CREATE POLICY "Users can view own inventory" ON public.user_inventory FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own inventory" ON public.user_inventory;
CREATE POLICY "Users can insert own inventory" ON public.user_inventory FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own inventory" ON public.user_inventory;
CREATE POLICY "Users can update own inventory" ON public.user_inventory FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all inventory" ON public.user_inventory;
CREATE POLICY "Admins can manage all inventory" ON public.user_inventory FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ============================================================================
-- 2. CRIAR FUNÇÃO USE_INVENTORY_ITEM
-- ============================================================================
CREATE OR REPLACE FUNCTION public.use_inventory_item(p_inventory_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
BEGIN
  SELECT * INTO v_item FROM public.user_inventory WHERE id = p_inventory_id AND is_used = FALSE;
  IF v_item IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Item não encontrado ou já foi usado');
  END IF;
  UPDATE public.user_inventory SET is_used = TRUE, used_at = NOW() WHERE id = p_inventory_id;
  RETURN json_build_object('success', true, 'message', 'Item usado com sucesso!');
END;
$$;

GRANT EXECUTE ON FUNCTION public.use_inventory_item(UUID) TO authenticated;

-- ============================================================================
-- 3. CRIAR FUNÇÃO TRANSFER_INVENTORY_ITEM
-- ============================================================================
CREATE OR REPLACE FUNCTION public.transfer_inventory_item(p_inventory_id UUID, p_recipient_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
BEGIN
  SELECT * INTO v_item FROM public.user_inventory WHERE id = p_inventory_id;
  IF v_item IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Item não encontrado');
  END IF;
  IF v_item.user_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'message', 'Você não é o dono deste item');
  END IF;
  IF v_item.is_used = TRUE THEN
    RETURN json_build_object('success', false, 'message', 'Item já foi usado e não pode ser transferido');
  END IF;
  UPDATE public.user_inventory SET user_id = p_recipient_id WHERE id = p_inventory_id;
  RETURN json_build_object('success', true, 'message', 'Item transferido com sucesso!');
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_inventory_item(UUID, UUID) TO authenticated;

-- ============================================================================
-- 4. CRIAR BUCKET DE IMAGENS
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketplace-images', 'marketplace-images', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 5. CORRIGIR POLÍTICAS DE STORAGE
-- ============================================================================
DROP POLICY IF EXISTS "Admin upload marketplace images" ON storage.objects;
CREATE POLICY "Admin upload marketplace images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'marketplace-images' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admin delete marketplace images" ON storage.objects;
CREATE POLICY "Admin delete marketplace images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'marketplace-images' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admin update marketplace images" ON storage.objects;
CREATE POLICY "Admin update marketplace images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'marketplace-images' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Public read marketplace images" ON storage.objects;
CREATE POLICY "Public read marketplace images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'marketplace-images');

-- ============================================================================
-- 6. CRIAR FUNÇÃO CHECK_IS_ADMIN (corrigido - sem cast para enum)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
$$;

GRANT EXECUTE ON FUNCTION public.check_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_is_admin() TO anon;

-- ============================================================================
-- 7. CRIAR TRIGGER PARA PRIMEIRO USUÁRIO SER ADMIN (corrigido)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.user_roles WHERE role = 'admin';
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- FIM - Execute este código e atualize a página
-- ============================================================================
