-- Tabela para vincular contas Discord <-> DuelVerse
CREATE TABLE IF NOT EXISTS public.discord_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL UNIQUE,
  discord_username TEXT NOT NULL,
  discord_global_name TEXT,
  discord_avatar_url TEXT,
  discord_email TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.discord_links ENABLE ROW LEVEL SECURITY;

-- Usuários podem ver/gerenciar apenas a própria vinculação
CREATE POLICY "Users view own discord link"
  ON public.discord_links FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own discord link"
  ON public.discord_links FOR DELETE
  USING (auth.uid() = user_id);

-- Apenas service role insere/atualiza (via edge function OAuth)
CREATE POLICY "Service role manages discord links"
  ON public.discord_links FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Admins podem ver todos
CREATE POLICY "Admins view all discord links"
  ON public.discord_links FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Index para lookup rápido por discord_id
CREATE INDEX IF NOT EXISTS idx_discord_links_discord_id ON public.discord_links(discord_id);

-- Trigger para updated_at
CREATE TRIGGER set_discord_links_updated_at
  BEFORE UPDATE ON public.discord_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Função para buscar user_id DuelVerse por discord_id (usada pela bridge)
CREATE OR REPLACE FUNCTION public.get_user_by_discord_id(p_discord_id TEXT)
RETURNS TABLE(user_id UUID, username TEXT, avatar_url TEXT)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.user_id, p.username, p.avatar_url
  FROM public.profiles p
  INNER JOIN public.discord_links dl ON dl.user_id = p.user_id
  WHERE dl.discord_id = p_discord_id
  LIMIT 1;
$$;

-- Função para buscar dados Discord do usuário (usada para enviar com avatar correto)
CREATE OR REPLACE FUNCTION public.get_discord_link_for_user(p_user_id UUID)
RETURNS TABLE(discord_id TEXT, discord_username TEXT, discord_avatar_url TEXT)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT discord_id, discord_username, discord_avatar_url
  FROM public.discord_links
  WHERE user_id = p_user_id
  LIMIT 1;
$$;