-- Adicionar políticas para admins gerenciarem torneios
CREATE POLICY "Admins can delete tournaments"
ON public.tournaments
FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update tournaments"
ON public.tournaments
FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()));

-- Criar tabela de configurações do sistema
CREATE TABLE public.system_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Políticas para system_settings
CREATE POLICY "Everyone can view settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage settings"
ON public.system_settings
FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Inserir configurações padrão
INSERT INTO public.system_settings (key, value) VALUES
  ('support_email', ''),
  ('pix_key', '')
ON CONFLICT (key) DO NOTHING;