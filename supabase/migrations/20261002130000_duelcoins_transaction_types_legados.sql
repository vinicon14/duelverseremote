-- Amplia a constraint de transaction_type com valores usados por funções antigas
-- (tournament_refund_participant -> 'tournament_refund'; RPCs legadas de taxa/prêmio ->
-- 'tournament_entry_fee' / 'tournament_surplus'). Superconjunto da constraint anterior
-- (20261002084339), portanto nenhuma linha existente a viola. Idempotente.
ALTER TABLE public.duelcoins_transactions
  DROP CONSTRAINT IF EXISTS duelcoins_transactions_transaction_type_check;

ALTER TABLE public.duelcoins_transactions
  ADD CONSTRAINT duelcoins_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'transfer',
    'admin_add',
    'admin_remove',
    'tournament_entry',
    'tournament_prize',
    'tournament_prize_deposit',
    'subscription',
    'marketplace_purchase',
    'judge_reward',
    'nickname_change',
    'battle_pass_reward',
    'battle_pass_mission',
    'battle_pass_pro',
    'purchase',
    'tournament_refund',
    'tournament_surplus',
    'tournament_entry_fee'
  ]));
