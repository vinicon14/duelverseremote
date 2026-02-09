import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.21.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // SQL para criar a tabela pro_tokens
    const createTableSQL = `
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
    `

    // Executar o SQL
    const { error } = await supabaseAdmin.rpc('exec_sql', { sql: createTableSQL })

    if (error) {
      // Se a função exec_sql não existir, tentar criar via query direta
      console.log('Tentando criar tabela via query direta...')
      
      // Verificar se a tabela já existe
      const { data: tableExists, error: checkError } = await supabaseAdmin
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_name', 'pro_tokens')
        .eq('table_schema', 'public')
        .maybeSingle()

      if (checkError) throw checkError

      if (tableExists) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Tabela pro_tokens já existe' 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        )
      }

      // Se não existe, retornar instruções manuais
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Não foi possível criar a tabela automaticamente',
          instructions: 'Execute o SQL manualmente no Supabase Dashboard > SQL Editor',
          sql: createTableSQL
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Tabela pro_tokens criada com sucesso!' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
