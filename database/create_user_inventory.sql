-- ============================================================================
-- Criar tabela de inventário de usuários e funções necessárias
-- Execute no Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. Criar tabela user_inventory
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

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_user_inventory_user_id ON public.user_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_inventory_product_id ON public.user_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_user_inventory_is_used ON public.user_inventory(is_used);

-- Habilitar RLS
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
DROP POLICY IF EXISTS "Users can view own inventory" ON public.user_inventory;
CREATE POLICY "Users can view own inventory"
ON public.user_inventory FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own inventory" ON public.user_inventory;
CREATE POLICY "Users can insert own inventory"
ON public.user_inventory FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own inventory" ON public.user_inventory;
CREATE POLICY "Users can update own inventory"
ON public.user_inventory FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all inventory" ON public.user_inventory;
CREATE POLICY "Admins can manage all inventory"
ON public.user_inventory FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- ============================================================================
-- 2. Criar função para usar item
-- ============================================================================
CREATE OR REPLACE FUNCTION public.use_inventory_item(p_inventory_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_result JSON;
BEGIN
  -- Buscar o item
  SELECT * INTO v_item
  FROM public.user_inventory
  WHERE id = p_inventory_id AND is_used = FALSE;

  IF v_item IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Item não encontrado ou já foi usado');
  END IF;

  -- Marcar como usado
  UPDATE public.user_inventory
  SET is_used = TRUE, used_at = NOW()
  WHERE id = p_inventory_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Item usado com sucesso!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.use_inventory_item(UUID) TO authenticated;

-- ============================================================================
-- 3. Criar função para transferir item
-- ============================================================================
CREATE OR REPLACE FUNCTION public.transfer_inventory_item(p_inventory_id UUID, p_recipient_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_result JSON;
BEGIN
  -- Buscar o item
  SELECT * INTO v_item
  FROM public.user_inventory
  WHERE id = p_inventory_id;

  IF v_item IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Item não encontrado');
  END IF;

  -- Verificar se é o dono
  IF v_item.user_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'message', 'Você não é o dono deste item');
  END IF;

  -- Verificar se não está usado
  IF v_item.is_used = TRUE THEN
    RETURN json_build_object('success', false, 'message', 'Item já foi usado e não pode ser transferido');
  END IF;

  -- Transferir
  UPDATE public.user_inventory
  SET user_id = p_recipient_id
  WHERE id = p_inventory_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Item transferido com sucesso!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_inventory_item(UUID, UUID) TO authenticated;
