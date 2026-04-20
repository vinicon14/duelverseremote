
-- Allow sellers to update their own products
CREATE POLICY "Sellers can update own products"
ON public.marketplace_products
FOR UPDATE
TO authenticated
USING (auth.uid() = seller_id)
WITH CHECK (auth.uid() = seller_id);

-- Allow sellers to delete their own products
CREATE POLICY "Sellers can delete own products"
ON public.marketplace_products
FOR DELETE
TO authenticated
USING (auth.uid() = seller_id);

-- Allow sellers to view their own products (even inactive/unapproved)
CREATE POLICY "Sellers can view own products"
ON public.marketplace_products
FOR SELECT
TO authenticated
USING (auth.uid() = seller_id);
