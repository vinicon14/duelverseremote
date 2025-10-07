-- ============================================================================
-- POLÍTICAS RLS COM FUNÇÃO SECURITY DEFINER (SEM RECURSÃO)
-- ============================================================================
-- Execute este SQL completo no Supabase SQL Editor
-- ============================================================================

-- PASSO 1: Criar função SECURITY DEFINER para verificar roles
-- Esta função bypassa o RLS e evita recursão infinita
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role::app_role
  )
$$;

-- PASSO 2: Remover TODAS as políticas existentes
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

-- PASSO 3: Garantir que RLS está habilitado
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- PASSO 4: ADMINS podem DELETAR qualquer perfil
CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- PASSO 5: ADMINS podem ATUALIZAR qualquer perfil
CREATE POLICY "Admins can update profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- PASSO 6: ADMINS podem LER todos os perfis
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- PASSO 7: USUÁRIOS COMUNS podem ver SEU PRÓPRIO perfil
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- PASSO 8: USUÁRIOS COMUNS podem atualizar SEU PRÓPRIO perfil
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
DROP POLICY IF EXISTS "Admins full access to user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access to user_roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- chat_messages: Admins podem deletar
DROP POLICY IF EXISTS "Admins can delete chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Admins can delete any chat message" ON public.chat_messages;

CREATE POLICY "Admins can delete chat messages"
ON public.chat_messages
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- friend_requests: Admins podem deletar
DROP POLICY IF EXISTS "Admins can delete friend_requests" ON public.friend_requests;
DROP POLICY IF EXISTS "Admins can delete friend requests" ON public.friend_requests;

CREATE POLICY "Admins can delete friend_requests"
ON public.friend_requests
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- live_duels: Admins podem deletar
DROP POLICY IF EXISTS "Admins can delete live_duels" ON public.live_duels;
DROP POLICY IF EXISTS "Admins can delete live duels" ON public.live_duels;

CREATE POLICY "Admins can delete live_duels"
ON public.live_duels
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- match_history: Admins podem deletar
DROP POLICY IF EXISTS "Admins can delete match_history" ON public.match_history;
DROP POLICY IF EXISTS "Admins can delete match history" ON public.match_history;

CREATE POLICY "Admins can delete match_history"
ON public.match_history
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- ✅ CONCLUÍDO!
-- ============================================================================
