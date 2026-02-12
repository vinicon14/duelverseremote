-- Correção para problema de histórico de transações não aparecendo
-- Data: 2026-02-13

-- ============================================
-- 1. SIMPLIFICAR POLÍTICAS RLS
-- ============================================

-- Remover todas as políticas existentes para recriar
DROP POLICY IF EXISTS "Users view own transactions" ON public.duelcoins_transactions;
DROP POLICY IF EXISTS "Only through functions" ON public.duelcoins_transactions;
DROP POLICY IF EXISTS "Admins view all transactions" ON public.duelcoins_transactions;

-- Política simplificada: usuários veem transações onde são sender OU receiver
-- Inclui transações onde sender_id é NULL (prêmios de torneio) OU receiver_id é NULL
CREATE POLICY "Users view own transactions"
ON public.duelcoins_transactions
FOR SELECT
USING (
  auth.uid() = sender_id 
  OR auth.uid() = receiver_id
);

-- Política para admins verem tudo
CREATE POLICY "Admins view all transactions"
ON public.duelcoins_transactions
FOR SELECT
USING (is_admin(auth.uid()));

-- Política para permitir inserção via funções RPC
CREATE POLICY "System can insert transactions"
ON public.duelcoins_transactions
FOR INSERT
WITH CHECK (
  -- Permitir inserção se o usuário é admin
  is_admin(auth.uid())
  -- Ou se é uma função de segurança definida (SECURITY DEFINER)
  -- As funções RPC rodam com privilégios elevados
);

-- ============================================
-- 2. FUNÇÃO RPC PARA BUSCAR HISTÓRICO
-- ============================================

-- Função segura para buscar histórico de transações do usuário
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
  WHERE t.sender_id = auth.uid() 
     OR t.receiver_id = auth.uid()
  ORDER BY t.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. CORRIGIR TRANSAÇÕES COM IDS INVÁLIDOS
-- ============================================

-- Garantir que transações de prêmio tenham receiver_id válido
UPDATE public.duelcoins_transactions
SET receiver_id = sender_id
WHERE receiver_id IS NULL 
  AND sender_id IS NOT NULL
  AND transaction_type = 'tournament_prize';

-- ============================================
-- 4. PERMISSÕES
-- ============================================

GRANT EXECUTE ON FUNCTION public.get_user_transactions(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_transactions(INTEGER) TO anon;

-- ============================================
-- 5. COMENTÁRIOS
-- ============================================

COMMENT ON POLICY "Users view own transactions" ON public.duelcoins_transactions IS 
'Usuários podem ver transações onde são remetente ou destinatário. Simplificado para evitar problemas de permissão.';

COMMENT ON FUNCTION public.get_user_transactions(INTEGER) IS 
'Retorna o histórico de transações do usuário logado com informações de usernames. Usa SECURITY DEFINER para bypass RLS.';

-- ============================================
-- 6. VERIFICAR DADOS
-- ============================================

-- Contar transações por usuário (para debug)
-- SELECT 
--   COALESCE(sender_id, receiver_id) as user_id,
--   COUNT(*) as transaction_count
-- FROM public.duelcoins_transactions
-- GROUP BY COALESCE(sender_id, receiver_id)
-- ORDER BY transaction_count DESC;
