-- supabase/migrations/20251022120001_add_duelcoins_transactions.sql

DROP TABLE IF EXISTS public.duelcoins_transactions CASCADE;
CREATE TABLE public.duelcoins_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id uuid REFERENCES public.profiles(user_id),
    receiver_id uuid REFERENCES public.profiles(user_id),
    amount integer NOT NULL,
    description text,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT duelcoins_transactions_amount_check CHECK ((amount > 0))
);

CREATE INDEX idx_duelcoins_transactions_sender_id ON public.duelcoins_transactions(sender_id);
CREATE INDEX idx_duelcoins_transactions_receiver_id ON public.duelcoins_transactions(receiver_id);

ALTER TABLE public.duelcoins_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transactions" ON public.duelcoins_transactions FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Admins can view all transactions" ON public.duelcoins_transactions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
