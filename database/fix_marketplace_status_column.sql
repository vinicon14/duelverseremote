-- ============================================================================
-- CORREÇÃO URGENTE: Adicionar coluna status se não existir
-- Execute este SQL no Supabase SQL Editor
-- ============================================================================

-- 1. Verificar se a coluna status existe, se não existir, adicionar
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketplace_purchases' AND column_name = 'status'
    ) THEN
        ALTER TABLE public.marketplace_purchases ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'pending';
    END IF;
END $$;

-- 2. Verificar se a coluna updated_at existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketplace_purchases' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.marketplace_purchases ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- 3. Verificar e corrigir políticas RLS para permitir admin atualizar status
DROP POLICY IF EXISTS "Users update own purchases" ON public.marketplace_purchases;
CREATE POLICY "Users update own purchases" ON public.marketplace_purchases FOR UPDATE TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins update all purchases" ON public.marketplace_purchases;
CREATE POLICY "Admins update all purchases" ON public.marketplace_purchases FOR UPDATE TO authenticated 
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')) 
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- 4. Verificar se a coluna status está com valor padrão correto para registros existentes
UPDATE public.marketplace_purchases 
SET status = 'pending' 
WHERE status IS NULL OR status = '';

-- 5. Garantir que as colunas created_at e updated_at existam
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'marketplace_purchases' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.marketplace_purchases ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- 6. Criar índices se não existirem
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_user_id ON public.marketplace_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_status ON public.marketplace_purchases(status);

-- 7. Verificar se RLS está habilitado
ALTER TABLE public.marketplace_purchases ENABLE ROW LEVEL SECURITY;

-- 8. Testar o update (apenas para verificar se funciona)
-- SELECT id, status FROM public.marketplace_purchases LIMIT 5;
