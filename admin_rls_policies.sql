-- ============================================================================
-- POLÍTICAS RLS SIMPLIFICADAS PARA ADMINISTRADORES
-- ============================================================================
-- Execute este SQL completo no Supabase SQL Editor
-- ============================================================================

-- PASSO 1: Remover TODAS as políticas existentes da tabela profiles
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- PASSO 2: Garantir que RLS está habilitado
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- PASSO 3: ADMINS podem DELETAR qualquer perfil
-- Verifica diretamente na tabela user_roles se o usuário atual tem role 'admin'
CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- PASSO 4: ADMINS podem ATUALIZAR qualquer perfil
CREATE POLICY "Admins can update profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- PASSO 5: ADMINS podem LER todos os perfis
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- PASSO 6: USUÁRIOS COMUNS podem ver SEU PRÓPRIO perfil
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- PASSO 7: USUÁRIOS COMUNS podem atualizar SEU PRÓPRIO perfil
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- POLÍTICAS PARA OUTRAS TABELAS
-- ============================================================================

-- user_roles: Admins podem gerenciar
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;

CREATE POLICY "Admins full access to user_roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'admin'
  )
);

-- chat_messages: Admins podem deletar
DROP POLICY IF EXISTS "Admins can delete any chat message" ON public.chat_messages;

CREATE POLICY "Admins can delete chat messages"
ON public.chat_messages
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- friend_requests: Admins podem deletar
DROP POLICY IF EXISTS "Admins can delete friend requests" ON public.friend_requests;

CREATE POLICY "Admins can delete friend_requests"
ON public.friend_requests
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- live_duels: Admins podem deletar
DROP POLICY IF EXISTS "Admins can delete live duels" ON public.live_duels;

CREATE POLICY "Admins can delete live_duels"
ON public.live_duels
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- match_history: Admins podem deletar
DROP POLICY IF EXISTS "Admins can delete match history" ON public.match_history;

CREATE POLICY "Admins can delete match_history"
ON public.match_history
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- ============================================================================
-- ✅ CONCLUÍDO!
-- ============================================================================
-- Execute este SQL completo no Supabase SQL Editor
-- Depois disso, os administradores poderão:
-- - Deletar qualquer usuário
-- - Atualizar qualquer perfil (mudar account_type)
-- - Ver todos os perfis
-- - Gerenciar roles
-- ============================================================================
