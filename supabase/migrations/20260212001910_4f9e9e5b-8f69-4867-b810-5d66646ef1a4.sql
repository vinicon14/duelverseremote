-- Adicionar coluna tournament_id à tabela duelcoins_transactions
ALTER TABLE public.duelcoins_transactions 
ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL;

-- Criar índice para buscas por torneio
CREATE INDEX IF NOT EXISTS idx_duelcoins_transactions_tournament_id 
ON public.duelcoins_transactions(tournament_id);

-- Atualizar RLS para incluir transações de torneios onde o usuário participa
DROP POLICY IF EXISTS "Users view own transactions" ON public.duelcoins_transactions;

CREATE POLICY "Users view own transactions"
ON public.duelcoins_transactions
FOR SELECT
USING (
  auth.uid() = sender_id 
  OR auth.uid() = receiver_id
  OR EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = duelcoins_transactions.tournament_id
    AND (t.created_by = auth.uid() OR auth.uid() IN (
      SELECT user_id FROM public.tournament_participants 
      WHERE tournament_id = t.id
    ))
  )
);