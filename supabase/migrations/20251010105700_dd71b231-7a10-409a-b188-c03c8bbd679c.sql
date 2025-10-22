-- Criar tabela para configurações do sistema
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Políticas: Todos podem ler, apenas admins podem modificar
CREATE POLICY "Anyone can view settings"
ON public.system_settings FOR SELECT
USING (true);

CREATE POLICY "Admins can insert settings"
ON public.system_settings FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update settings"
ON public.system_settings FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete settings"
ON public.system_settings FOR DELETE
USING (is_admin(auth.uid()));

-- Inserir configurações padrão
INSERT INTO public.system_settings (key, value) VALUES
  ('support_email', 'suporte@duelverse.com'),
  ('pix_key', '')
ON CONFLICT (key) DO NOTHING;