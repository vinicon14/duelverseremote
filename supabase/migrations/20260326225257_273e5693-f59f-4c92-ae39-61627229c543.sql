
ALTER TABLE public.marketplace_purchases
DROP CONSTRAINT IF EXISTS marketplace_purchases_product_id_fkey;

ALTER TABLE public.marketplace_purchases
ADD CONSTRAINT marketplace_purchases_product_id_fkey
FOREIGN KEY (product_id) REFERENCES public.marketplace_products(id) ON DELETE CASCADE;

ALTER TABLE public.user_inventory
DROP CONSTRAINT IF EXISTS user_inventory_product_id_fkey;

ALTER TABLE public.user_inventory
ADD CONSTRAINT user_inventory_product_id_fkey
FOREIGN KEY (product_id) REFERENCES public.marketplace_products(id) ON DELETE CASCADE;
