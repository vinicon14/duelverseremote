-- Adicionar configuração de URL da loja
INSERT INTO public.system_settings (key, value)
VALUES ('store_url', 'https://loja.menu/duelverse')
ON CONFLICT (key) DO NOTHING;