-- Adicionar configuração de URL da loja
INSERT INTO public.system_settings (key, value)
VALUES ('store_url', 'https://loja.duelverse.online')
ON CONFLICT (key) DO NOTHING;