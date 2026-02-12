-- Step 7: Enable RLS
ALTER TABLE public.shop_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duelcoins_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duelcoins_cashouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashout_admin_codes ENABLE ROW LEVEL SECURITY;