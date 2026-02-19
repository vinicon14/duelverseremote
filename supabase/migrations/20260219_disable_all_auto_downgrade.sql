-- Completely disable auto-downgrade by making the function do nothing
CREATE OR REPLACE FUNCTION check_expired_subscriptions()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Função desativada - não faz mais nada
  -- O admin é quem controla o status PRO manualmente
  -- Não há mais downgrade automático
END;
$$;
