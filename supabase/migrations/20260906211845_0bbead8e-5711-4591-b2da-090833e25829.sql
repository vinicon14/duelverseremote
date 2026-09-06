ALTER TABLE public.marketplace_products
  ADD COLUMN IF NOT EXISTS price_brl numeric(10,2),
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'duelcoins';

DO $$ BEGIN
  ALTER TABLE public.marketplace_products
    ADD CONSTRAINT marketplace_products_payment_type_check
    CHECK (payment_type IN ('duelcoins','money'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.marketplace_purchases
  ADD COLUMN IF NOT EXISTS amount_brl numeric(10,2),
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS external_order_id text,
  ADD COLUMN IF NOT EXISTS external_payment_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS shipping_name text,
  ADD COLUMN IF NOT EXISTS buyer_email text;

CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_external_order
  ON public.marketplace_purchases (external_order_id);