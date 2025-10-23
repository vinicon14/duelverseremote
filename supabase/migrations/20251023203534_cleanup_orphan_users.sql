-- ============================================================================
-- LIMPEZA DE USUÁRIOS ÓRFÃOS
-- ============================================================================

-- Este script remove usuários da tabela `auth.users` que não possuem um
-- perfil correspondente na tabela `public.profiles`. Isso garante a
-- integridade dos dados, eliminando contas de autenticação que não
-- estão mais em uso.

BEGIN;

DELETE FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.profiles p
  WHERE p.user_id = u.id
);

COMMIT;