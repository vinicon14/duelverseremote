-- Criar enum para tipos de conta
CREATE TYPE public.account_type AS ENUM ('free', 'pro');

-- Criar enum para roles de usuário
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Adicionar account_type à tabela profiles
ALTER TABLE profiles 
ADD COLUMN account_type account_type NOT NULL DEFAULT 'free',
ADD COLUMN is_banned boolean NOT NULL DEFAULT false;

-- Criar tabela de roles de usuário (segurança)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  role app_role NOT NULL,
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  granted_by UUID REFERENCES profiles(user_id),
  UNIQUE(user_id, role)
);

-- Criar tabela de notícias
CREATE TABLE public.news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  image_url TEXT,
  author_id UUID NOT NULL REFERENCES profiles(user_id),
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar tabela de anúncios
CREATE TABLE public.advertisements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  link_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  position TEXT NOT NULL DEFAULT 'sidebar' CHECK (position IN ('sidebar', 'banner', 'footer')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Índices para performance
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_news_published ON news(published, created_at DESC);
CREATE INDEX idx_advertisements_active ON advertisements(active, expires_at);

-- Função de segurança para verificar role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Função para verificar se usuário é admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- RLS para user_roles
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles"
  ON user_roles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
  ON user_roles FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- RLS para news
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view published news"
  ON news FOR SELECT
  USING (published = true);

CREATE POLICY "Admins can view all news"
  ON news FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage news"
  ON news FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- RLS para advertisements
ALTER TABLE advertisements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Free users can view active ads"
  ON advertisements FOR SELECT
  USING (
    active = true 
    AND (expires_at IS NULL OR expires_at > NOW())
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE user_id = auth.uid() 
      AND account_type = 'free'
    )
  );

CREATE POLICY "Everyone can view ads for display"
  ON advertisements FOR SELECT
  USING (active = true AND (expires_at IS NULL OR expires_at > NOW()));

CREATE POLICY "Admins can manage advertisements"
  ON advertisements FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Atualizar política de criação de torneios
DROP POLICY IF EXISTS "Authenticated users can create tournaments" ON tournaments;

CREATE POLICY "Pro users and admins can create tournaments"
  ON tournaments FOR INSERT
  WITH CHECK (
    auth.uid() = created_by 
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM profiles 
        WHERE user_id = auth.uid() 
        AND account_type = 'pro'
      )
    )
  );

-- Trigger para updated_at
CREATE TRIGGER update_news_updated_at
  BEFORE UPDATE ON news
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Ativar realtime
ALTER TABLE news REPLICA IDENTITY FULL;
ALTER TABLE advertisements REPLICA IDENTITY FULL;
ALTER TABLE user_roles REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE news;
ALTER PUBLICATION supabase_realtime ADD TABLE advertisements;
ALTER PUBLICATION supabase_realtime ADD TABLE user_roles;