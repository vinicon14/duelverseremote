-- Fix missing RLS policies for marketplace purchases and third-party products

-- Add INSERT policy for marketplace_purchases so users can record purchases
DROP POLICY IF EXISTS "Users insert purchases" ON public.marketplace_purchases;
CREATE POLICY "Users insert purchases" ON public.marketplace_purchases
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Add INSERT policy for marketplace_products for third-party sellers
DROP POLICY IF EXISTS "Third party sellers insert products" ON public.marketplace_products;
CREATE POLICY "Third party sellers insert products" ON public.marketplace_products
  FOR INSERT TO authenticated
  WITH CHECK (seller_id = auth.uid() OR seller_id IS NULL);

-- Ensure user_inventory has proper INSERT policy (may already exist)
DROP POLICY IF EXISTS "Users insert own inventory" ON public.user_inventory;
CREATE POLICY "Users insert own inventory" ON public.user_inventory
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Grant execute on functions if needed
GRANT EXECUTE ON FUNCTION public.transfer_inventory_item TO authenticated;
GRANT EXECUTE ON FUNCTION public.use_inventory_item TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_item_to_inventory TO authenticated;

-- Add DELETE policy for global_chat_messages for admins & moderators
DROP POLICY IF EXISTS "Admins can delete global chat messages" ON public.global_chat_messages;
CREATE POLICY "Admins (and moderators) can delete global chat messages" ON public.global_chat_messages
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
