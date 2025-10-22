-- supabase/migrations/20251022130001_add_fk_to_duelcoins_transactions.sql

ALTER TABLE public.duelcoins_transactions
  ADD CONSTRAINT duelcoins_transactions_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  ADD CONSTRAINT duelcoins_transactions_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
