-- Allow receiver_id to be NULL for admin_remove transactions
ALTER TABLE public.duelcoins_transactions ALTER COLUMN receiver_id DROP NOT NULL;

-- Also ensure sender_id can be NULL (for admin_add transactions)
ALTER TABLE public.duelcoins_transactions ALTER COLUMN sender_id DROP NOT NULL;