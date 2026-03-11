-- ============================================================================
-- Script simples para restaurar função de admin
-- Execute no Supabase SQL Editor
-- ============================================================================

-- PASSO 1: Criar função RPC para verificar admin (bypass RLS)
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

-- PASSO 2: Verificar se a tabela user_roles existe e está acessível
-- (Se estiver vazia ou com erro, proceed para o próximo passo)

-- PASSO 3: Se souber o UUID do usuário, adicione como admin:
-- Substitua 'COLOQUE_O_UUID_AQUI' pelo UUID do usuário
-- INSERT INTO user_roles (user_id, role) VALUES ('COLOQUE_O_UUID_AQUI', 'admin') ON CONFLICT DO NOTHING;

-- PASSO 4: Criar trigger automático para novos usuários (opcional)
-- O primeiro usuário a se registrar será admin

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.user_roles WHERE role = 'admin';
  
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- PASSO 5: Testar
SELECT public.check_is_admin();
