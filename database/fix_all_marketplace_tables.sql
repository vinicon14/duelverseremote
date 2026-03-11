-- ============================================================================
-- SQL COMPLETO PARA CORRIGIR TODOS OS PROBLEMAS DO MARKETPLACE
-- Execute este SQL único no Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. CRIAR TABELA marketplace_products
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketplace_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price_duelcoins INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  category VARCHAR(50) NOT NULL DEFAULT 'digital_item',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_third_party_seller BOOLEAN NOT NULL DEFAULT FALSE,
  seller_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_products_seller_id ON public.marketplace_products(seller_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_category ON public.marketplace_products(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_is_active ON public.marketplace_products(is_active);

ALTER TABLE public.marketplace_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active products" ON public.marketplace_products;
CREATE POLICY "Anyone can view active products" ON public.marketplace_products FOR SELECT TO public USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage products" ON public.marketplace_products;
CREATE POLICY "Admins can manage products" ON public.marketplace_products FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ============================================================================
-- 2. CRIAR TABELA marketplace_purchases
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketplace_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.marketplace_products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_price INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_user_id ON public.marketplace_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_status ON public.marketplace_purchases(status);

ALTER TABLE public.marketplace_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own purchases" ON public.marketplace_purchases;
CREATE POLICY "Users view own purchases" ON public.marketplace_purchases FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert purchases" ON public.marketplace_purchases;
CREATE POLICY "Users insert purchases" ON public.marketplace_purchases FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own purchases" ON public.marketplace_purchases;
CREATE POLICY "Users update own purchases" ON public.marketplace_purchases FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all purchases" ON public.marketplace_purchases;
CREATE POLICY "Admins view all purchases" ON public.marketplace_purchases FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins update all purchases" ON public.marketplace_purchases;
CREATE POLICY "Admins update all purchases" ON public.marketplace_purchases FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ============================================================================
-- 3. CRIAR TABELA user_inventory
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
-- 4. CRIAR BUCKET DE IMAGENS
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketplace-images', 'marketplace-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admin upload marketplace images" ON storage.objects;
CREATE POLICY "Admin upload marketplace images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'marketplace-images' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admin delete marketplace images" ON storage.objects;
CREATE POLICY "Admin delete marketplace images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'marketplace-images' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admin update marketplace images" ON storage.objects;
CREATE POLICY "Admin update marketplace images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'marketplace-images' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Public read marketplace images" ON storage.objects;
CREATE POLICY "Public read marketplace images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'marketplace-images');

-- ============================================================================
-- 5. CRIAR FUNÇÕES ÚTEIS
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
-- 6. ATUALIZAR SCHEMA CACHE DO SUPABASE
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 7. VERIFICAR QUE TODAS AS TABELAS FORAM CRIADAS
-- ============================================================================
SELECT 
  'marketplace_products' as table_name,
  (SELECT COUNT(*) > 0 FROM information_schema.tables WHERE table_name = 'marketplace_products' AND table_schema = 'public') as exists
UNION ALL
SELECT 
  'marketplace_purchases',
  (SELECT COUNT(*) > 0 FROM information_schema.tables WHERE table_name = 'marketplace_purchases' AND table_schema = 'public')
UNION ALL
SELECT 
  'user_inventory',
  (SELECT COUNT(*) > 0 FROM information_schema.tables WHERE table_name = 'user_inventory' AND table_schema = 'public');
