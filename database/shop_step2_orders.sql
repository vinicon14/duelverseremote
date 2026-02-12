-- Step 2: Create shop_orders table
CREATE TABLE IF NOT EXISTS public.shop_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) NOT NULL,
    product_id uuid REFERENCES public.shop_products(id),
    quantity integer DEFAULT 1,
    total_price numeric(10,2) NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
    payment_method text NOT NULL CHECK (payment_method IN ('pix', 'credit_card', 'debit_card')),
    payment_id text,
    pix_code text,
    pix_qr_code text,
    tracking_code text,
    delivery_address jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);