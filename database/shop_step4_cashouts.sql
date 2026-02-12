-- Step 4: Create duelcoins_cashouts table
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