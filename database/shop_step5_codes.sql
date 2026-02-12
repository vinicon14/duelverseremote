-- Step 5: Create cashout_admin_codes table
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