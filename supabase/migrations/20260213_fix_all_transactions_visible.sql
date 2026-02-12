-- CORREÇÃO DEFINITIVA: Todas as transações devem aparecer para todos os usuários
-- Data: 2026-02-13

-- ============================================
-- 1. VERIFICAR E CORRIGIR TRANSAÇÕES PROBLEMATICAS
-- ============================================

-- Verificar se há transações com ambos NULL (não deveriam existir)
-- SELECT * FROM public.duelcoins_transactions WHERE sender_id IS NULL AND receiver_id IS NULL;

-- Corrigir transações com sender_id=NULL (prêmios) - garantir que têm receiver_id válido
UPDATE public.duelcoins_transactions
SET receiver_id = '00000000-0000-0000-0000-000000000000'::uuid
WHERE sender_id IS NULL AND receiver_id IS NULL;

-- ============================================
-- 2. POLÍTICA RLS SIMPLIFICADA E ROBUSTA
-- ============================================

-- Remover políticas antigas
DROP POLICY IF EXISTS "Users view own transactions" ON public.duelcoins_transactions;
DROP POLICY IF EXISTS "Admins view all transactions" ON public.duelcoins_transactions;
DROP POLICY IF EXISTS "System can insert transactions" ON public.duelcoins_transactions;
DROP POLICY IF EXISTS "Only through functions" ON public.duelcoins_transactions;

-- Política para usuários verem suas transações
-- Lógica: Se o usuário é sender OU receiver, pode ver
-- Tratamento especial: Se sender_id IS NULL e receiver_id = user_id, pode ver (prêmios)
-- Tratamento especial: Se receiver_id IS NULL e sender_id = user_id, pode ver (taxas)
CREATE POLICY "Users view own transactions"
ON public.duelcoins_transactions
FOR SELECT
USING (
  -- Usuário é sender
  auth.uid() = sender_id
  -- Ou usuário é receiver
  OR auth.uid() = receiver_id
  -- Ou é uma transação de prêmio (sender=NULL) e o usuário é receiver
  OR (sender_id IS NULL AND auth.uid() = receiver_id)
  -- Ou é uma transação de taxa (receiver=NULL) e o usuário é sender
  OR (receiver_id IS NULL AND auth.uid() = sender_id)
);

-- Política para admins verem tudo
CREATE POLICY "Admins view all transactions"
ON public.duelcoins_transactions
FOR SELECT
USING (is_admin(auth.uid()));

-- Política para permitir inserção via funções RPC (SECURITY DEFINER)
CREATE POLICY "System can insert transactions"
ON public.duelcoins_transactions
FOR INSERT
WITH CHECK (true);  -- As funções RPC validam permissões internamente

-- ============================================
-- 3. FUNÇÃO RPC ROBUSTA COM PAGINAÇÃO
-- ============================================

-- Drop function if exists with different signature
DROP FUNCTION IF EXISTS public.get_user_transactions();
DROP FUNCTION IF EXISTS public.get_user_transactions(INTEGER);
DROP FUNCTION IF EXISTS public.get_user_transactions(INTEGER, INTEGER);

-- Criar função com paginação
CREATE OR REPLACE FUNCTION public.get_user_transactions(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
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
DECLARE
  v_user_id UUID;
BEGIN
  -- Obter ID do usuário atual
  v_user_id := auth.uid();
  
  -- Retornar transações onde o usuário é sender OU receiver
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
  WHERE t.sender_id = v_user_id 
     OR t.receiver_id = v_user_id
  ORDER BY t.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. FUNÇÃO PARA CONTAR TOTAL DE TRANSAÇÕES (para paginação)
-- ============================================

CREATE OR REPLACE FUNCTION public.count_user_transactions()
RETURNS INTEGER AS $$
DECLARE
  v_user_id UUID;
  v_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  
  SELECT COUNT(*) INTO v_count
  FROM public.duelcoins_transactions
  WHERE sender_id = v_user_id 
     OR receiver_id = v_user_id;
     
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. PERMISSÕES
-- ============================================

GRANT EXECUTE ON FUNCTION public.get_user_transactions(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_user_transactions() TO authenticated;

-- ============================================
-- 6. COMENTÁRIOS
-- ============================================

COMMENT ON POLICY "Users view own transactions" ON public.duelcoins_transactions IS 
'Usuários podem ver transações onde são remetente ou destinatário. 
Inclui transações com sender_id=NULL (prêmios) ou receiver_id=NULL (taxas).';

COMMENT ON FUNCTION public.get_user_transactions(INTEGER, INTEGER) IS 
'Retorna o histórico de transações do usuário logado com paginação.
Parâmetros: p_limit (quantidade), p_offset (deslocamento).';

-- ============================================
-- 7. VERIFICAÇÃO
-- ============================================

-- Contar quantas transações cada usuário deveria ver:
-- SELECT 
--   COALESCE(sender_id, receiver_id) as user_id,
--   COUNT(*) as total_transacoes
-- FROM public.duelcoins_transactions
-- GROUP BY COALESCE(sender_id, receiver_id)
-- ORDER BY total_transacoes DESC
-- LIMIT 20;
