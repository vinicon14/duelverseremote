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

-- ============================================================================
-- PASSO 2: Depois de descobrir o ID, execute este comando abaixo
-- Substitua 'COLOQUE_O_USER_ID_AQUI' pelo UUID real encontrado acima
-- Exemplo: WHERE user_id = '12345678-1234-1234-1234-123456789012'
-- ============================================================================

-- Para ver as roles atuais do usuário (descomente e ajuste o UUID):
-- SELECT * FROM user_roles WHERE user_id = 'COLOQUE_O_USER_ID_AQUI';

-- Para adicionar role admin (descomente e ajuste o UUID):
-- INSERT INTO user_roles (user_id, role) 
-- VALUES ('COLOQUE_O_USER_ID_AQUI', 'admin')
-- ON CONFLICT DO NOTHING;

-- ============================================================================
-- VERSÃO SIMPLIFICADA - Execute tudo de uma vez
-- ============================================================================

-- Este comando adiciona admin ao usuário pelo email diretamente:
INSERT INTO user_roles (user_id, role) 
SELECT 
  u.id,
  'admin'
FROM auth.users u
WHERE u.email = 'vinimarques12122020@gmail.com'
ON CONFLICT DO NOTHING;

-- Verificar se agora tem acesso admin:
SELECT public.check_is_admin();
