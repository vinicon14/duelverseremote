-- CORREÇÃO CRÍTICA: Histórico de transações não aparece para usuários free/pro
-- Data: 2026-02-13
-- Problema: Política RLS não lida com valores NULL em sender_id/receiver_id

-- ============================================
-- 1. CORRIGIR POLÍTICA RLS PARA LIDAR COM NULL
-- ============================================

-- Remover política problemática
DROP POLICY IF EXISTS "Users view own transactions" ON public.duelcoins_transactions;

-- Criar política corrigida usando COALESCE
-- Quando sender_id ou receiver_id for NULL, COALESCE retorna o user_id atual
-- permitindo que o usuário veja transações onde ele é o receiver (mesmo com sender NULL)
CREATE POLICY "Users view own transactions"
ON public.duelcoins_transactions
FOR SELECT
USING (
  auth.uid() = COALESCE(sender_id, auth.uid())
  OR auth.uid() = COALESCE(receiver_id, auth.uid())
);

-- Garantir política de admin
DROP POLICY IF EXISTS "Admins view all transactions" ON public.duelcoins_transactions;
CREATE POLICY "Admins view all transactions"
ON public.duelcoins_transactions
FOR SELECT
USING (is_admin(auth.uid()));

-- ============================================
-- 2. CORRIGIR FUNÇÃO RPC PARA USAR MESMA LÓGICA
-- ============================================

CREATE OR REPLACE FUNCTION public.get_user_transactions(
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  sender_id UUID,
  receiver_id UUID,
  amount INTEGER,
  transaction_type TEXT,
  description TEXT,
  tournament_id UUID,
  created_at TIMESTAMPTZ,
  sender_username TEXT,
  receiver_username TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.sender_id,
    t.receiver_id,
    t.amount,
    t.transaction_type,
    t.description,
    t.tournament_id,
    t.created_at,
    COALESCE(s.username, 'Sistema') as sender_username,
    COALESCE(r.username, 'Sistema') as receiver_username
  FROM public.duelcoins_transactions t
  LEFT JOIN public.profiles s ON s.user_id = t.sender_id
  LEFT JOIN public.profiles r ON r.user_id = t.receiver_id
  WHERE auth.uid() = COALESCE(t.sender_id, auth.uid())
     OR auth.uid() = COALESCE(t.receiver_id, auth.uid())
  ORDER BY t.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. GARANTIR PERMISSÕES CORRETAS
-- ============================================

GRANT EXECUTE ON FUNCTION public.get_user_transactions(INTEGER) TO authenticated;

-- ============================================
-- 4. COMENTÁRIOS
-- ============================================

COMMENT ON POLICY "Users view own transactions" ON public.duelcoins_transactions IS 
'Usuários podem ver transações onde são remetente ou destinatário. 
Corrigido com COALESCE para lidar com valores NULL em sender_id/receiver_id.
Transações com sender_id=NULL (prêmios) são visíveis para o receiver.';

-- ============================================
-- 5. VERIFICAÇÃO (descomente para testar)
-- ============================================

-- Verificar se usuário específico vê suas transações:
-- SELECT * FROM public.duelcoins_transactions 
-- WHERE auth.uid() = COALESCE(sender_id, auth.uid())
--    OR auth.uid() = COALESCE(receiver_id, auth.uid())
-- LIMIT 10;

-- Contar transações visíveis por usuário:
-- SELECT 
--   COALESCE(sender_id, receiver_id) as user_id,
--   COUNT(*) as count
-- FROM public.duelcoins_transactions
-- GROUP BY COALESCE(sender_id, receiver_id);
