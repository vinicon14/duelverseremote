ALTER TABLE public.duelcoins_transactions
DROP CONSTRAINT IF EXISTS duelcoins_transactions_transaction_type_check;

ALTER TABLE public.duelcoins_transactions
ADD CONSTRAINT duelcoins_transactions_transaction_type_check
CHECK (
  transaction_type = ANY (
    ARRAY[
      'transfer'::text,
      'admin_add'::text,
      'admin_remove'::text,
      'tournament_entry'::text,
      'tournament_prize'::text,
      'subscription'::text,
      'marketplace_purchase'::text,
      'judge_reward'::text
    ]
  )
);