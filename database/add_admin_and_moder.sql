-- Adicionar role admin e moderador ao usuário
-- Execute no Supabase SQL Editor

-- Primeiro, descubra o ID do usuário
SELECT id, email FROM auth.users WHERE email LIKE '%vinimarques%' OR email LIKE '%vinimarquers%';

-- Após descobrir o UUID, substitua abaixo e execute:
-- INSERT INTO user_roles (user_id, role) VALUES ('UUID_AQUI', 'admin') ON CONFLICT DO NOTHING;
-- INSERT INTO user_roles (user_id, role) VALUES ('UUID_AQUI', 'moderator') ON CONFLICT DO NOTHING;

-- OU: Se souber o UUID específico, substitua:
-- INSERT INTO user_roles (user_id, role) VALUES ('COLOQUE_O_UUID_AQUI', 'admin') ON CONFLICT DO NOTHING;
-- INSERT INTO user_roles (user_id, role) VALUES ('COLOQUE_O_UUID_AQUI', 'moderator') ON CONFLICT DO NOTHING;
