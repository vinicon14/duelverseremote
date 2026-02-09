# Setup do Sistema Duelverse PRO

## Opção 1: Setup Automático (Recomendado)

1. Certifique-se de que o servidor está rodando: `npm run dev`
2. Acesse: http://127.0.0.1:8081/setup
3. Clique em "Executar Setup"
4. Se der erro, use a Opção 2

## Opção 2: Setup Manual pelo Supabase Dashboard

1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto Duelverse
3. No menu lateral, clique em **SQL Editor**
4. Clique em **New query**
5. Cole o SQL abaixo:

```sql
-- Criar tabela de tokens PRO para autenticação por token
CREATE TABLE IF NOT EXISTS pro_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_pro_tokens_token ON pro_tokens(token);
CREATE INDEX IF NOT EXISTS idx_pro_tokens_email ON pro_tokens(email);
CREATE INDEX IF NOT EXISTS idx_pro_tokens_user_id ON pro_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_pro_tokens_is_active ON pro_tokens(is_active);

-- Habilitar RLS
ALTER TABLE pro_tokens ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança
DROP POLICY IF EXISTS "Admins can view all tokens" ON pro_tokens;
CREATE POLICY "Admins can view all tokens" ON pro_tokens
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can insert tokens" ON pro_tokens;
CREATE POLICY "Admins can insert tokens" ON pro_tokens
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update tokens" ON pro_tokens;
CREATE POLICY "Admins can update tokens" ON pro_tokens
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can view own tokens" ON pro_tokens;
CREATE POLICY "Users can view own tokens" ON pro_tokens
  FOR SELECT
  USING (user_id = auth.uid());

-- Comentário da tabela
COMMENT ON TABLE pro_tokens IS 'Tokens de acesso PRO para autenticação sem anúncios';
```

6. Clique em **Run** (botão verde no canto superior direito)
7. Pronto! A tabela foi criada.

## Como usar o Sistema PRO

### Para Administradores:

1. Acesse o painel admin: http://127.0.0.1:8081/admin
2. Vá na aba **"Tokens PRO"**
3. Para gerar um token:
   - Preencha o email do usuário
   - Preencha o ID do usuário (UUID do perfil)
   - Clique em "Gerar Token"
   - Copie o token e envie ao usuário

### Para Usuários PRO:

1. Acesse: http://127.0.0.1:8081/login
2. Digite seu email e o token recebido
3. Clique em "Acessar PRO"
4. A sessão ficará ativa por 30 dias

## Estrutura do Token

Formato: `XXXXX-XXXXX-XXXXX`

Exemplo: `AB12C-D34EF-G56HI`

## Segurança

- Cada token é único e vinculado a um email específico
- Tokens de outros usuários não funcionam em emails diferentes
- Tokens podem ser revogados pelo admin a qualquer momento
- Sessões expiram em 30 dias
- Todas as rotas são protegidas, exceto /login e /setup

## Troubleshooting

### "Tabela pro_tokens não existe"
- Execute o setup manual pelo SQL Editor do Supabase

### "Token inválido"
- Verifique se o email está correto (case sensitive)
- Verifique se o token não foi revogado
- Verifique se o token não expirou

### "Erro de permissão"
- Certifique-se de que as políticas RLS foram criadas corretamente
- Verifique se o usuário tem role 'admin' na tabela user_roles
