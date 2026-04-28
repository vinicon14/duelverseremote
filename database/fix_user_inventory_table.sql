-- ============================================================================
-- CRIA TABELA user_inventory SE NÃO EXISTIR
-- Execute no Supabase SQL Editor
-- ============================================================================

-- 1. Criar tabela user_inventory se não existir
CREATE TABLE IF NOT EXISTS public.user_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.marketplace_products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Criar índices
CREATE INDEX IF NOT EXISTS idx_user_inventory_user_id ON public.user_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_inventory_product_id ON public.user_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_user_inventory_is_used ON public.user_inventory(is_used);

-- 3. Habilitar RLS
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS
DROP POLICY IF EXISTS "Users can view own inventory" ON public.user_inventory;
CREATE POLICY "Users can view own inventory" ON public.user_inventory FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own inventory" ON public.user_inventory;
CREATE POLICY "Users can insert own inventory" ON public.user_inventory FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own inventory" ON public.user_inventory;
CREATE POLICY "Users can update own inventory" ON public.user_inventory FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all inventory" ON public.user_inventory;
CREATE POLICY "Admins can manage all inventory" ON public.user_inventory FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- 5. Atualizar schema cache do Supabase (forçar recarregar)
NOTIFY pgrst, 'reload schema';

-- 6. Verificar se a tabela existe
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'user_inventory';
