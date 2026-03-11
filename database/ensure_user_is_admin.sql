-- ============================================================================
-- Script para verificar e adicionar role de admin ao usuário
-- Execute no Supabase SQL Editor
-- ============================================================================

-- PASSO 1: Primeiro, descubra o ID do usuário pelo email
-- Substitua 'vinimarques12122020@gmail.com' pelo email correto
SELECT 
  id,
  email,
  created_at
FROM auth.users 
WHERE email = 'vinimarques12122020@gmail.com';

-- PASSO 2: Verificar as roles atuais do usuário
-- Substitua o USER_ID pelo ID encontrado no passo anterior
-- SELECT * FROM user_roles WHERE user_id = 'COLOQUE_O_USER_ID_AQUI';

-- PASSO 3: Se não tiver role admin, adicione:
-- INSERT INTO user_roles (user_id, role) 
-- VALUES ('COLOQUE_O_USER_ID_AQUI', 'admin')
-- ON CONFLICT DO NOTHING;

-- PASSO 4: Verificar se agora tem acesso admin
-- SELECT public.check_is_admin();
