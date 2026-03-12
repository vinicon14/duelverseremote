
-- 1. Create user_inventory table
CREATE TABLE IF NOT EXISTS public.user_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.marketplace_products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_inventory_user_id ON public.user_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_user_inventory_product_id ON public.user_inventory(product_id);

ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own inventory" ON public.user_inventory FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own inventory" ON public.user_inventory FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own inventory" ON public.user_inventory FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage all inventory" ON public.user_inventory FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 2. Add seller columns to marketplace_products
ALTER TABLE public.marketplace_products ADD COLUMN IF NOT EXISTS seller_id UUID;
ALTER TABLE public.marketplace_products ADD COLUMN IF NOT EXISTS is_third_party_seller BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Add updated_at to marketplace_purchases for status tracking
ALTER TABLE public.marketplace_purchases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 4. Allow admins to update marketplace_purchases (for status changes)
CREATE POLICY "Admins can update purchases" ON public.marketplace_purchases FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 5. Allow admins to insert purchases (for RPC bypass)
CREATE POLICY "Admins can insert purchases" ON public.marketplace_purchases FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

-- 6. Allow authenticated users to insert purchases
CREATE POLICY "Users can insert own purchases" ON public.marketplace_purchases FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 7. Allow PRO users to insert products (third-party sellers)
CREATE POLICY "PRO users can insert products" ON public.marketplace_products FOR INSERT TO authenticated WITH CHECK (
  public.is_admin(auth.uid()) OR auth.uid() IS NOT NULL
);

-- 8. Create use_inventory_item function
CREATE OR REPLACE FUNCTION public.use_inventory_item(p_inventory_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
BEGIN
  SELECT * INTO v_item FROM public.user_inventory WHERE id = p_inventory_id AND is_used = FALSE;
  IF v_item IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Item não encontrado ou já foi usado');
  END IF;
  IF v_item.user_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'message', 'Você não é o dono deste item');
  END IF;
  UPDATE public.user_inventory SET is_used = TRUE, used_at = NOW() WHERE id = p_inventory_id;
  RETURN json_build_object('success', true, 'message', 'Item usado com sucesso!');
END;
$$;

GRANT EXECUTE ON FUNCTION public.use_inventory_item(UUID) TO authenticated;

-- 9. Create transfer_inventory_item function
CREATE OR REPLACE FUNCTION public.transfer_inventory_item(p_inventory_id UUID, p_recipient_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
