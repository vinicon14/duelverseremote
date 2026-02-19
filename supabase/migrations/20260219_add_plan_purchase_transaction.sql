-- Add plan_purchase to allowed transaction types
ALTER TABLE public.duelcoins_transactions 
DROP CONSTRAINT IF EXISTS duelcoins_transactions_transaction_type_check;

ALTER TABLE public.duelcoins_transactions 
ADD CONSTRAINT duelcoins_transactions_transaction_type_check 
CHECK (transaction_type IN ('transfer', 'admin_add', 'admin_remove', 'tournament_entry', 'tournament_prize', 'plan_purchase'));
