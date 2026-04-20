-- Remover política problemática que permite acesso irrestrito
DROP POLICY IF EXISTS "Anyone with link can view recordings" ON public.match_recordings;

-- A política "Anyone can view public recordings" já existe e está correta
-- A política "Owners can view their own recordings" já existe e está correta

-- Garantir que apenas gravações públicas OU do próprio usuário sejam visíveis
-- As políticas existentes já cobrem isso:
-- 1. "Anyone can view public recordings" - permite ver públicas
-- 2. "Owners can view their own recordings" - permite ver as próprias