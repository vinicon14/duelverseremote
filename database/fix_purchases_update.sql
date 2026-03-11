-- ============================================================================
-- SQL para criar/adicionar políticas de marketplace_purchases
-- Execute no Supabase SQL Editor
-- ============================================================================

-- Criar tabela se não existir
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

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_user_id ON public.marketplace_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_status ON public.marketplace_purchases(status);

-- Habilitar RLS
ALTER TABLE public.marketplace_purchases ENABLE ROW LEVEL SECURITY;

-- Políticas
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
