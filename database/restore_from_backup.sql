-- ============================================================================
-- Script para restaurar o banco de dados para o estado do commit 988eb47
-- Execute no Supabase SQL Editor
-- ============================================================================

-- ATENÇÃO: Este script vai resetar o banco de dados!
-- Execute apenas se você tiver um backup ou quiser resetar tudo.

-- ============================================================================
-- PASSO 1: Resetar todas as tabelas (cuidado: apaga todos os dados)
-- ============================================================================

-- Desabilitar triggers temporariamente
ALTER TABLE auth.users DISABLE TRIGGER ALL;
ALTER TABLE public.profiles DISABLE TRIGGER ALL;
ALTER TABLE public.user_roles DISABLE TRIGGER ALL;

-- Limpar todas as tabelas
TRUNCATE TABLE public.notifications CASCADE;
TRUNCATE TABLE public.friend_requests CASCADE;
TRUNCATE TABLE public.private_messages CASCADE;
TRUNCATE TABLE public.duel_invites CASCADE;
TRUNCATE TABLE public.tournament_chat_messages CASCADE;
TRUNCATE TABLE public.global_chat_messages CASCADE;
TRUNCATE TABLE public.tournaments CASCADE;
TRUNCATE TABLE public.tournament_participants CASCADE;
TRUNCATE TABLE public.tournament_matches CASCADE;
TRUNCATE TABLE public.user_subscriptions CASCADE;
TRUNCATE TABLE public.saved_decks CASCADE;
TRUNCATE TABLE public.marketplace_items CASCADE;
TRUNCATE TABLE public.purchases CASCADE;
TRUNCATE TABLE public.news CASCADE;
TRUNCATE TABLE public.advertisements CASCADE;
TRUNCATE TABLE public.user_roles CASCADE;
TRUNCATE TABLE public.profiles CASCADE;
TRUNCATE TABLE public.live_duels CASCADE;

-- ============================================================================
-- PASSO 2: Recriar estrutura básica (se necessário)
-- ============================================================================

-- A estrutura já deve existir. Se não existir, execute as migrações.
-- O trigger on_auth_user_created deve criar o perfil automaticamente.

-- ============================================================================
-- PASSO 3: Promover o primeiro usuário a admin (lógica do 988eb47)
-- ============================================================================

-- Este trigger faz o primeiro usuário criado ser admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_count INTEGER;
BEGIN
  -- Conta usuários existentes
  SELECT COUNT(*) INTO user_count FROM public.profiles;
  
  -- Se for o primeiro usuário, torna admin
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recriar trigger (se não existir)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- PASSO 4: Criar função RPC para verificar admin
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
  )
$$;

GRANT EXECUTE ON FUNCTION public.check_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_is_admin() TO anon;

-- ============================================================================
-- PASSO 5: Reabilitar triggers
-- ============================================================================

ALTER TABLE auth.users ENABLE TRIGGER ALL;
ALTER TABLE public.profiles ENABLE TRIGGER ALL;
ALTER TABLE public.user_roles ENABLE TRIGGER ALL;

-- ============================================================================
-- INSTRUÇÕES:
-- 1. Faça logout de todas as contas no app
-- 2. Delete todos os usuários em Settings > Authentication > Users (ou execute SQL)
-- 3. Recrie o usuário admin fazendo login pela primeira vez
-- 4. O primeiro usuário a se registrar será automaticamente admin
-- ============================================================================
