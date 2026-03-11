-- ============================================================================
-- Script para listar todos os usuários admin e verificar admins
-- Execute no Supabase SQL Editor
-- ============================================================================

-- Listar todos os usuários com role admin
SELECT 
  ur.user_id,
  u.email,
  ur.role,
  ur.created_at
FROM user_roles ur
LEFT JOIN auth.users u ON ur.user_id = u.id
WHERE ur.role = 'admin';

-- Verificar se o usuário específico é admin
-- Substitua o email pelo email do usuário
SELECT 
  ur.user_id,
  u.email,
  ur.role
FROM user_roles ur
LEFT JOIN auth.users u ON ur.user_id = u.id
WHERE u.email = 'vinimarques12122020@gmail.com';

-- Adicionar role admin ao usuário pelo email
INSERT INTO user_roles (user_id, role) 
SELECT 
  u.id,
  'admin'
FROM auth.users u
WHERE u.email = 'vinimarques12122020@gmail.com'
ON CONFLICT DO NOTHING;

-- Verificar se a função RPC está funcionando
SELECT public.check_is_admin();
