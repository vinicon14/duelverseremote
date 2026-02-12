-- Step 6: Create indexes
CREATE INDEX IF NOT EXISTS idx_shop_products_category ON public.shop_products(category);
CREATE INDEX IF NOT EXISTS idx_shop_products_type ON public.shop_products(product_type);
CREATE INDEX IF NOT EXISTS idx_shop_products_active ON public.shop_products(is_active);
CREATE INDEX IF NOT EXISTS idx_shop_orders_user_id ON public.shop_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_orders_status ON public.shop_orders(status);
CREATE INDEX IF NOT EXISTS idx_duelcoins_purchases_user_id ON public.duelcoins_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_duelcoins_purchases_status ON public.duelcoins_purchases(status);
CREATE INDEX IF NOT EXISTS idx_duelcoins_cashouts_user_id ON public.duelcoins_cashouts(user_id);
CREATE INDEX IF NOT EXISTS idx_duelcoins_cashouts_status ON public.duelcoins_cashouts(status);