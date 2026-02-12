-- Step 3: Create duelcoins_purchases table
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