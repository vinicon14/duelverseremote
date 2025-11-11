-- Limpar tabela push_subscriptions e adicionar constraint UNIQUE
-- Como é desenvolvimento, podemos limpar a tabela
TRUNCATE TABLE public.push_subscriptions;

-- Adicionar constraint UNIQUE no endpoint
ALTER TABLE public.push_subscriptions
ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);