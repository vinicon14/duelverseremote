-- Create shop_products table
CREATE TABLE IF NOT EXISTS public.shop_products (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    image_url text,
    category text NOT NULL DEFAULT 'normal',
    product_type text NOT NULL DEFAULT 'normal' CHECK (product_type IN ('normal', 'duelcoins', 'cashout')),
    duelcoins_amount integer,
    cashout_fee_percentage numeric(5,2) DEFAULT 0,
    stock_quantity integer DEFAULT 1,
    is_active boolean DEFAULT true,
    is_digital boolean DEFAULT false,
    delivery_info text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid REFERENCES auth.users(id)
);

-- Create shop_orders table
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

-- Create duelcoins_purchases table
CREATE TABLE IF NOT EXISTS public.duelcoins_purchases (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) NOT NULL,
    amount integer NOT NULL,
    price numeric(10,2) NOT NULL,
    payment_method text NOT NULL CHECK (payment_method IN ('pix', 'credit_card', 'debit_card')),
    payment_id text,
    pix_code text,
    pix_qr_code text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create duelcoins_cashouts table
CREATE TABLE IF NOT EXISTS public.duelcoins_cashouts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) NOT NULL,
    amount integer NOT NULL,
    fee_amount numeric(10,2) NOT NULL,
    final_amount numeric(10,2) NOT NULL,
    payment_method text NOT NULL DEFAULT 'pix' CHECK (payment_method IN ('pix', 'bank_transfer')),
    pix_key text,
    bank_info jsonb,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
    admin_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create cashout_admin_codes table for PIX codes
CREATE TABLE IF NOT EXISTS public.cashout_admin_codes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cashout_id uuid REFERENCES public.duelcoins_cashouts(id) NOT NULL,
    code text NOT NULL UNIQUE,
    used boolean DEFAULT false,
    used_by uuid REFERENCES auth.users(id),
    used_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_shop_products_category ON public.shop_products(category);
CREATE INDEX IF NOT EXISTS idx_shop_products_type ON public.shop_products(product_type);
CREATE INDEX IF NOT EXISTS idx_shop_products_active ON public.shop_products(is_active);
CREATE INDEX IF NOT EXISTS idx_shop_orders_user_id ON public.shop_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_shop_orders_status ON public.shop_orders(status);
CREATE INDEX IF NOT EXISTS idx_duelcoins_purchases_user_id ON public.duelcoins_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_duelcoins_purchases_status ON public.duelcoins_purchases(status);
CREATE INDEX IF NOT EXISTS idx_duelcoins_cashouts_user_id ON public.duelcoins_cashouts(user_id);
CREATE INDEX IF NOT EXISTS idx_duelcoins_cashouts_status ON public.duelcoins_cashouts(status);

-- Enable RLS
ALTER TABLE public.shop_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duelcoins_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duelcoins_cashouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashout_admin_codes ENABLE ROW LEVEL SECURITY;

-- RLS policies for shop_products (admin only)
CREATE POLICY "Admins can insert shop products" ON public.shop_products
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Admins can update shop products" ON public.shop_products
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Admins can delete shop products" ON public.shop_products
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Anyone can view active shop products" ON public.shop_products
    FOR SELECT USING (is_active = true);

-- RLS policies for shop_orders
CREATE POLICY "Users can view own orders" ON public.shop_orders
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own orders" ON public.shop_orders
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all orders" ON public.shop_orders
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Admins can update orders" ON public.shop_orders
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- RLS policies for duelcoins_purchases
CREATE POLICY "Users can view own purchases" ON public.duelcoins_purchases
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own purchases" ON public.duelcoins_purchases
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all purchases" ON public.duelcoins_purchases
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- RLS policies for duelcoins_cashouts
CREATE POLICY "Users can view own cashouts" ON public.duelcoins_cashouts
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own cashouts" ON public.duelcoins_cashouts
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all cashouts" ON public.duelcoins_cashouts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Admins can update cashouts" ON public.duelcoins_cashouts
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- RLS policies for cashout_admin_codes
CREATE POLICY "Admins can view cashout codes" ON public.cashout_admin_codes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Admins can insert cashout codes" ON public.cashout_admin_codes
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can update cashout codes" ON public.cashout_admin_codes
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Functions for automatic duelcoins transfer
CREATE OR REPLACE FUNCTION process_duelcoins_purchase(
    p_user_id uuid,
    p_amount integer,
    p_payment_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    existing_balance integer;
BEGIN
    -- Get current balance
    SELECT COALESCE(balance, 0) INTO existing_balance
    FROM profiles
    WHERE user_id = p_user_id;
    
    -- Update balance (add duelcoins)
    UPDATE profiles
    SET 
        balance = existing_balance + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id;
    
    -- Create transaction record
    INSERT INTO duelcoins_transactions (
        user_id,
        amount,
        transaction_type,
        description,
        payment_id,
        created_at
    ) VALUES (
        p_user_id,
        p_amount,
        'purchase',
        'Compra de DuelCoins - ID: ' || p_payment_id,
        p_payment_id,
        now()
    );
END;
$$;

-- Function for automatic duelcoins deduction (cashout)
CREATE OR REPLACE FUNCTION process_duelcoins_cashout(
    p_user_id uuid,
    p_amount integer,
    p_fee_amount numeric(10,2)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    existing_balance integer;
    total_deduction integer;
BEGIN
    -- Get current balance
    SELECT COALESCE(balance, 0) INTO existing_balance
    FROM profiles
    WHERE user_id = p_user_id;
    
    -- Calculate total deduction (amount + fee converted to duelcoins)
    total_deduction := p_amount + CEIL(p_fee_amount); -- Convert fee to duelcoins
    
    -- Check if user has enough balance
    IF existing_balance < total_deduction THEN
        RAISE EXCEPTION 'Saldo insuficiente para resgate';
    END IF;
    
    -- Update balance (deduct duelcoins)
    UPDATE profiles
    SET 
        balance = existing_balance - total_deduction,
        updated_at = now()
    WHERE user_id = p_user_id;
    
    -- Create transaction record
    INSERT INTO duelcoins_transactions (
        user_id,
        amount,
        transaction_type,
        description,
        created_at
    ) VALUES (
        p_user_id,
        total_deduction * -1, -- Negative for deduction
        'cashout',
        'Resgate de DuelCoins - Taxa: ' || p_fee_amount,
        now()
    );
END;
$$;

-- Insert default cashout fee setting
INSERT INTO system_settings (key, value, description)
VALUES ('cashout_fee_percentage', '10.00', 'Percentual de taxa para resgate de DuelCoins')
ON CONFLICT (key) DO NOTHING;