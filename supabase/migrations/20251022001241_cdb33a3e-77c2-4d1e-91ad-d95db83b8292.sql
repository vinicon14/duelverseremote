-- ====================================
-- SISTEMA DE DUELCOINS - ECONOMIA INTERNA
-- ====================================

-- 1. Adicionar coluna de DuelCoins na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS duelcoins_balance INTEGER NOT NULL DEFAULT 0;

-- 2. Criar tabela de transações de DuelCoins
CREATE TABLE IF NOT EXISTS public.duelcoins_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('transfer', 'admin_add', 'admin_remove', 'tournament_entry', 'tournament_prize')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Habilitar RLS na tabela de transações
ALTER TABLE public.duelcoins_transactions ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS para transações
-- Usuários podem ver suas próprias transações
CREATE POLICY "Users view own transactions"
ON public.duelcoins_transactions
FOR SELECT
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Apenas sistema/admin pode inserir transações (via função)
CREATE POLICY "Only through functions"
ON public.duelcoins_transactions
FOR INSERT
WITH CHECK (false);

-- Admins podem ver todas as transações
CREATE POLICY "Admins view all transactions"
ON public.duelcoins_transactions
FOR SELECT
USING (is_admin(auth.uid()));

-- 5. Função para transferir DuelCoins entre usuários
CREATE OR REPLACE FUNCTION public.transfer_duelcoins(
  p_receiver_id UUID,
  p_amount INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id UUID;
  v_sender_balance INTEGER;
  v_receiver_username TEXT;
  v_sender_username TEXT;
BEGIN
  -- Validar autenticação
  v_sender_id := auth.uid();
  IF v_sender_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  -- Validar que não está enviando para si mesmo
  IF v_sender_id = p_receiver_id THEN
    RETURN json_build_object('success', false, 'message', 'Não é possível enviar DuelCoins para si mesmo');
  END IF;

  -- Validar quantidade
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'message', 'Quantidade inválida');
  END IF;

  -- Verificar saldo do remetente
  SELECT duelcoins_balance INTO v_sender_balance
  FROM public.profiles
  WHERE user_id = v_sender_id;

  IF v_sender_balance < p_amount THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente');
  END IF;

  -- Verificar se destinatário existe
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_receiver_id) THEN
    RETURN json_build_object('success', false, 'message', 'Usuário destinatário não encontrado');
  END IF;

  -- Obter usernames para notificação
  SELECT username INTO v_sender_username FROM public.profiles WHERE user_id = v_sender_id;
  SELECT username INTO v_receiver_username FROM public.profiles WHERE user_id = p_receiver_id;

  -- Executar transação
  BEGIN
    -- Remover do remetente
    UPDATE public.profiles
    SET duelcoins_balance = duelcoins_balance - p_amount
    WHERE user_id = v_sender_id;

    -- Adicionar ao destinatário
    UPDATE public.profiles
    SET duelcoins_balance = duelcoins_balance + p_amount
    WHERE user_id = p_receiver_id;

    -- Registrar transação
    INSERT INTO public.duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, description)
    VALUES (
      v_sender_id, 
      p_receiver_id, 
      p_amount, 
      'transfer',
      format('Transferência de %s para %s', v_sender_username, v_receiver_username)
    );

    RETURN json_build_object(
      'success', true, 
      'message', format('Transferência de %s DuelCoins para %s realizada com sucesso!', p_amount, v_receiver_username)
    );
  EXCEPTION
    WHEN OTHERS THEN
      RETURN json_build_object('success', false, 'message', 'Erro ao processar transferência');
  END;
END;
$$;

-- 6. Função para admin adicionar/remover DuelCoins
CREATE OR REPLACE FUNCTION public.admin_manage_duelcoins(
  p_user_id UUID,
  p_amount INTEGER,
  p_operation TEXT, -- 'add' ou 'remove'
  p_reason TEXT DEFAULT 'Ajuste administrativo'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_current_balance INTEGER;
  v_username TEXT;
BEGIN
  -- Validar que é admin
  v_admin_id := auth.uid();
  IF NOT is_admin(v_admin_id) THEN
    RETURN json_build_object('success', false, 'message', 'Acesso negado');
  END IF;

  -- Validar operação
  IF p_operation NOT IN ('add', 'remove') THEN
    RETURN json_build_object('success', false, 'message', 'Operação inválida');
  END IF;

  -- Validar quantidade
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'message', 'Quantidade inválida');
  END IF;

  -- Verificar usuário existe
  SELECT duelcoins_balance, username INTO v_current_balance, v_username
  FROM public.profiles
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Usuário não encontrado');
  END IF;

  -- Se for remover, verificar se tem saldo suficiente
  IF p_operation = 'remove' AND v_current_balance < p_amount THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente para remoção');
  END IF;

  -- Executar operação
  IF p_operation = 'add' THEN
    UPDATE public.profiles
    SET duelcoins_balance = duelcoins_balance + p_amount
    WHERE user_id = p_user_id;

    INSERT INTO public.duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, description)
    VALUES (NULL, p_user_id, p_amount, 'admin_add', p_reason);

    RETURN json_build_object('success', true, 'message', format('Adicionados %s DuelCoins para %s', p_amount, v_username));
  ELSE
    UPDATE public.profiles
    SET duelcoins_balance = duelcoins_balance - p_amount
    WHERE user_id = p_user_id;

    INSERT INTO public.duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, description)
    VALUES (p_user_id, NULL, p_amount, 'admin_remove', p_reason);

    RETURN json_build_object('success', true, 'message', format('Removidos %s DuelCoins de %s', p_amount, v_username));
  END IF;
END;
$$;

-- 7. Atualizar torneios para suportar taxa de entrada
ALTER TABLE public.tournaments 
ADD COLUMN IF NOT EXISTS entry_fee INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_prize INTEGER NOT NULL DEFAULT 0;