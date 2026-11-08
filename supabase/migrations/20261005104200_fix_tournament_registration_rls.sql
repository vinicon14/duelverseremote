-- =====================================================
-- Correção: Inscrição em torneio pago sem RPC
-- Data: 2026-10-05 10:42:00
-- =====================================================
--
-- PROBLEMA 1: A policy "Usuarios podem se inscrever" (20260801124925) permite
-- INSERT direto em tournament_participants, burlando a cobrança da taxa de
-- inscrição (entry_fee).
--
-- SOLUÇÃO: Remover a policy de INSERT direto. Inscrições DEVEM passar por:
--   1. Edge function: charge-tournament-entry-fee
--   2. RPC SECURITY DEFINER: join_weekly_tournament
--
-- Ambas validam saldo, cobram entry_fee, registram transação e só então
-- inserem em tournament_participants atomicamente.
-- =====================================================

-- Remove a policy que permite INSERT direto
DROP POLICY IF EXISTS "Usuarios podem se inscrever" ON public.tournament_participants;

-- Mantém as outras policies (visualização, update próprio, delete do criador)
-- As inscrições agora SÓ podem acontecer via RPCs SECURITY DEFINER que:
--   1. Validam o saldo
--   2. Debitam o entry_fee (se > 0)
--   3. Registram a transação em duelcoins_transactions
--   4. Inserem o participante

-- Edge function charge-tournament-entry-fee já faz isso corretamente (linhas 136-189)
-- RPC join_weekly_tournament já faz isso corretamente (linhas 727-740)

COMMENT ON TABLE public.tournament_participants IS 
  'Participantes de torneios. INSERT bloqueado para authenticated: use charge-tournament-entry-fee (edge function) ou join_weekly_tournament (RPC) para inscrição.';
