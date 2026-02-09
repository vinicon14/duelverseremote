-- Política para admins visualizarem todos os perfis
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Garantir que admins possam visualizar todos os perfis publicamente visíveis
CREATE POLICY "Public profile data viewable by all"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Adicionar índices para melhor performance em buscas
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_is_online ON public.profiles(is_online);
CREATE INDEX IF NOT EXISTS idx_live_duels_status ON public.live_duels(status);
CREATE INDEX IF NOT EXISTS idx_live_duels_creator ON public.live_duels(creator_id);
CREATE INDEX IF NOT EXISTS idx_live_duels_opponent ON public.live_duels(opponent_id);