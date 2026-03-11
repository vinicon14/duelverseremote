-- Função RPC para verificar se o usuário atual é admin ou moderador
-- Esta função usa SECURITY DEFINER para bypassar RLS
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
  )
$;

-- Para testar no Supabase SQL Editor:
-- SELECT public.check_is_admin();

-- Para dar permissão de execução para usuários autenticados:
GRANT EXECUTE ON FUNCTION public.check_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_is_admin() TO anon;
