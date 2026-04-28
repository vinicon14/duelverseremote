-- Fix marketplace_products RLS policies to ensure admin access and third-party sellers

-- Drop existing third-party seller policy (if exists)
DROP POLICY IF EXISTS "Third party sellers manage own products" ON public.marketplace_products;

-- Ensure original policies exist
DROP POLICY IF EXISTS "Anyone can view active products" ON public.marketplace_products;
CREATE POLICY "Anyone can view active products" ON public.marketplace_products
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage products" ON public.marketplace_products;
CREATE POLICY "Admins manage products" ON public.marketplace_products
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Create policy for third-party sellers (PRO users can manage their own products)
CREATE POLICY "Third party sellers manage own products" ON public.marketplace_products
  FOR ALL TO authenticated
  USING (
    seller_id = auth.uid() 
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    seller_id = auth.uid() 
    OR public.is_admin(auth.uid())
  );

-- Also ensure the user_inventory table has proper policies
DROP POLICY IF EXISTS "Users view own inventory" ON public.user_inventory;
CREATE POLICY "Users view own inventory" ON public.user_inventory
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own inventory" ON public.user_inventory;
CREATE POLICY "Users insert own inventory" ON public.user_inventory
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own inventory" ON public.user_inventory;
CREATE POLICY "Users update own inventory" ON public.user_inventory
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own inventory" ON public.user_inventory;
CREATE POLICY "Users delete own inventory" ON public.user_inventory
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all inventory" ON public.user_inventory;
CREATE POLICY "Admins view all inventory" ON public.user_inventory
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
