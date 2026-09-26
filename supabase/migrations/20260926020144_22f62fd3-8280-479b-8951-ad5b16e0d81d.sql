CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA net;

CREATE OR REPLACE FUNCTION extensions.http_post(url text, body text, headers jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN net.http_post(
    url := url,
    body := body::jsonb,
    headers := headers
  );
END;
$$;