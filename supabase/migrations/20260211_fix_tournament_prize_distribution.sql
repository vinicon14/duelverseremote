-- Migração para melhorar o sistema de DuelCoins e histórico de transações
-- Adiciona suporte completo para rastreamento de transações de torneios

-- 1. Adicionar coluna tournament_id à tabela duelcoins_transactions
ALTER TABLE public.duelcoins_transactions 
ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL;

-- 2. Atualizar constraint de transaction_type para incluir todos os tipos necessários
ALTER TABLE public.duelcoins_transactions 
DROP CONSTRAINT IF EXISTS duelcoins_transactions_transaction_type_check;

ALTER TABLE public.duelcoins_transactions 
ADD CONSTRAINT duelcoins_transactions_transaction_type_check 
CHECK (transaction_type IN (
  'transfer',           -- Transferência entre usuários
  'admin_add',          -- Admin adicionou DuelCoins
  'admin_remove',       -- Admin removeu DuelCoins
  'tournament_entry',   -- Taxa de inscrição em torneio
  'tournament_prize',   -- Prêmio de torneio para vencedor
  'tournament_surplus'  -- Excedente devolvido ao criador
));

-- 3. Criar índice para facilitar buscas por torneio
CREATE INDEX IF NOT EXISTS idx_duelcoins_transactions_tournament_id 
ON public.duelcoins_transactions(tournament_id);

-- 4. Atualizar RLS policies para garantir que usuários possam ver transações relacionadas a torneios
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

-- 5. Função auxiliar para obter histórico de transações de um usuário com detalhes
CREATE OR REPLACE FUNCTION public.get_user_transaction_history(
  p_user_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  amount INT,
  transaction_type TEXT,
  description TEXT,
  created_at TIMESTAMPTZ,
  sender_username TEXT,
  receiver_username TEXT,
  tournament_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.amount,
    t.transaction_type,
    t.description,
    t.created_at,
    sender.username as sender_username,
    receiver.username as receiver_username,
    tour.name as tournament_name
  FROM public.duelcoins_transactions t
  LEFT JOIN public.profiles sender ON t.sender_id = sender.user_id
  LEFT JOIN public.profiles receiver ON t.receiver_id = receiver.user_id
  LEFT JOIN public.tournaments tour ON t.tournament_id = tour.id
  WHERE t.sender_id = p_user_id OR t.receiver_id = p_user_id
  ORDER BY t.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Função para distribuir prêmio de torneio (atualizada)
CREATE OR REPLACE FUNCTION public.distribute_tournament_prize(
    p_tournament_id UUID,
    p_winner_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_tournament RECORD;
    v_winner_profile RECORD;
    v_creator_profile RECORD;
    v_total_entry_fees INT;
BEGIN
    -- Buscar dados do torneio
    SELECT * INTO v_tournament
    FROM public.tournaments
    WHERE id = p_tournament_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
    END IF;

    IF v_tournament.status = 'completed' THEN
        RETURN json_build_object('success', false, 'message', 'Torneio já foi finalizado');
    END IF;

    -- Buscar perfil do vencedor
    SELECT * INTO v_winner_profile
    FROM public.profiles
    WHERE user_id = p_winner_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Vencedor não encontrado');
    END IF;

    -- Calcular total de taxas de entrada
    SELECT COALESCE(SUM(amount), 0) INTO v_total_entry_fees
    FROM public.duelcoins_transactions
    WHERE tournament_id = p_tournament_id 
    AND transaction_type = 'tournament_entry';

    -- Transferir prêmio para o vencedor (total das taxas de entrada)
    IF v_total_entry_fees > 0 THEN
        UPDATE public.profiles
        SET duelcoins_balance = duelcoins_balance + v_total_entry_fees
        WHERE user_id = p_winner_id;

        -- Registrar transação do prêmio
        INSERT INTO public.duelcoins_transactions (
            sender_id, 
            receiver_id, 
            amount, 
            transaction_type, 
            tournament_id,
            description
        ) VALUES (
            NULL, 
            p_winner_id, 
            v_total_entry_fees, 
            'tournament_prize', 
            p_tournament_id,
            format('Prêmio do torneio: %s', v_tournament.name)
        );
    END IF;

    -- Marcar participante como vencedor
    UPDATE public.tournament_participants
    SET status = 'winner'
    WHERE tournament_id = p_tournament_id 
    AND user_id = p_winner_id;

    -- Marcar torneio como completado
    UPDATE public.tournaments
    SET status = 'completed', 
        end_date = NOW()
    WHERE id = p_tournament_id;

    RETURN json_build_object(
        'success', true, 
        'message', format('Prêmio de %s DuelCoins distribuído para o vencedor!', v_total_entry_fees),
        'prize_amount', v_total_entry_fees
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
