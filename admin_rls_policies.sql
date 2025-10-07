-- ============================================================================
-- POLÍTICAS RLS PARA ADMINISTRADORES - EXECUTE NO SUPABASE SQL EDITOR
-- ============================================================================
-- Esta migração cria políticas RLS que permitem administradores gerenciar
-- todos os usuários da plataforma (deletar, atualizar, ler)
-- 
-- COMO USAR:
-- 1. Acesse seu projeto Supabase
-- 2. Vá em "SQL Editor"
-- 3. Cole este código completo
-- 4. Clique em "Run" para executar
-- ============================================================================

-- 1. Remover políticas existentes que podem estar conflitando
DROP POLICY IF EXISTS "Admins can delete any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- 2. Garantir que a função has_role existe (security definer para evitar recursão RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
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
      AND role = _role
  )
$$;

-- 3. ADMINS podem DELETAR qualquer perfil
CREATE POLICY "Admins can delete any profile"
ON public.profiles
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
);

-- 4. ADMINS podem ATUALIZAR qualquer perfil
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
);

-- 5. ADMINS podem LER todos os perfis
CREATE POLICY "Admins can read all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
);

-- 6. USUÁRIOS COMUNS podem ver seu próprio perfil
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
);

-- 7. USUÁRIOS COMUNS podem atualizar seu próprio perfil
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- POLÍTICAS PARA OUTRAS TABELAS (para permitir exclusão em cascata)
-- ============================================================================

-- 8. user_roles
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;

CREATE POLICY "Admins can manage user roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 9. chat_messages
DROP POLICY IF EXISTS "Admins can delete any chat message" ON public.chat_messages;

CREATE POLICY "Admins can delete any chat message"
ON public.chat_messages
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 10. friend_requests
DROP POLICY IF EXISTS "Admins can delete friend requests" ON public.friend_requests;

CREATE POLICY "Admins can delete friend requests"
ON public.friend_requests
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 11. live_duels
DROP POLICY IF EXISTS "Admins can delete live duels" ON public.live_duels;

CREATE POLICY "Admins can delete live duels"
ON public.live_duels
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 12. match_history
DROP POLICY IF EXISTS "Admins can delete match history" ON public.match_history;

CREATE POLICY "Admins can delete match history"
ON public.match_history
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- ✅ CONCLUÍDO!
-- ============================================================================
-- Agora os administradores podem:
-- - Deletar qualquer usuário
-- - Atualizar qualquer perfil (mudar account_type para PRO/FREE)
-- - Ver todos os perfis
-- - Gerenciar roles de usuários
-- ============================================================================
