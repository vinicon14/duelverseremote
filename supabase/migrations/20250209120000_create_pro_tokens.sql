-- Criar tabela de tokens PRO para autenticação por token
CREATE TABLE IF NOT EXISTS pro_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Garantir que um email só pode ter um token ativo por vez
  CONSTRAINT unique_active_email UNIQUE (email, is_active) 
    DEFERRABLE INITIALLY DEFERRED
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_pro_tokens_token ON pro_tokens(token);
CREATE INDEX IF NOT EXISTS idx_pro_tokens_email ON pro_tokens(email);
CREATE INDEX IF NOT EXISTS idx_pro_tokens_user_id ON pro_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_pro_tokens_is_active ON pro_tokens(is_active);

-- Políticas de segurança RLS (Row Level Security)
ALTER TABLE pro_tokens ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver todos os tokens
CREATE POLICY "Admins can view all tokens" ON pro_tokens
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Apenas admins podem criar tokens
CREATE POLICY "Admins can insert tokens" ON pro_tokens
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Apenas admins podem atualizar tokens
CREATE POLICY "Admins can update tokens" ON pro_tokens
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Usuários podem ver seus próprios tokens (para validação no login)
CREATE POLICY "Users can view own tokens" ON pro_tokens
  FOR SELECT
  USING (user_id = auth.uid());

-- Comentário da tabela
COMMENT ON TABLE pro_tokens IS 'Tokens de acesso PRO para autenticação sem anúncios';
