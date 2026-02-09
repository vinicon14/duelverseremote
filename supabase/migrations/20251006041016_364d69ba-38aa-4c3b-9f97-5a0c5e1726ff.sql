-- Promover usuário Duelverse a administrador
INSERT INTO user_roles (user_id, role)
VALUES ('5796bf27-9f95-4e90-8a78-27d9a9987012', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;