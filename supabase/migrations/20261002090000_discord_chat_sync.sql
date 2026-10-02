-- =====================================================================
-- discord-chat-sync: serverless Discord -> DuelVerse global chat mirror
-- (replaces the Java gateway bot for the Discord -> app direction).
-- Idempotent: safe to run more than once.
-- =====================================================================

-- 1. Race-safe dedupe by Discord message id.
--    A plain (non-partial) unique index is used on purpose: PostgREST's
--    on_conflict=discord_message_id (INSERT ... ON CONFLICT (discord_message_id)
--    DO NOTHING) cannot target a partial index. NULLs are distinct in unique
--    indexes, so app messages / legacy rows without an id are unaffected.
ALTER TABLE public.global_chat_messages
  ADD COLUMN IF NOT EXISTS discord_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS global_chat_messages_discord_message_id_key
  ON public.global_chat_messages (discord_message_id);

-- 2. Cursor state (last processed Discord message per channel). service_role only.
CREATE TABLE IF NOT EXISTS public.discord_chat_sync_state (
  channel_id text PRIMARY KEY,
  last_message_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.discord_chat_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.discord_chat_sync_state FROM PUBLIC;
REVOKE ALL ON TABLE public.discord_chat_sync_state FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.discord_chat_sync_state TO service_role;

DROP POLICY IF EXISTS "Service role manages discord chat sync state" ON public.discord_chat_sync_state;
CREATE POLICY "Service role manages discord chat sync state"
  ON public.discord_chat_sync_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Shared cron secret, generated once and stored in Vault (never in git).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'discord_chat_sync_secret') THEN
      PERFORM vault.create_secret(
        replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        'discord_chat_sync_secret',
        'Shared secret: pg_cron -> discord-chat-sync edge function (header x-cron-secret)'
      );
    END IF;
  ELSE
    RAISE NOTICE 'vault schema not found: discord-chat-sync will answer 503 until discord_chat_sync_secret exists';
  END IF;
END $$;

-- The edge function reads the expected secret through this RPC (service_role only).
CREATE OR REPLACE FUNCTION public.get_discord_chat_sync_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ds.decrypted_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'discord_chat_sync_secret'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_discord_chat_sync_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_discord_chat_sync_secret() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_discord_chat_sync_secret() TO service_role;

-- 4. Loop guard: never replicate Discord-originated rows back to Discord.
--    Same body as 20260421064806, plus the early return on source_type = 'discord'.
CREATE OR REPLACE FUNCTION public.replicate_chat_to_discord()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text;
  v_service_key text;
  v_username text;
  v_avatar text;
  v_payload jsonb;
BEGIN
  -- Mensagens vindas do Discord nunca voltam para o Discord (evita loop/eco)
  IF NEW.source_type = 'discord' THEN
    RETURN NEW;
  END IF;

  -- Buscar nome/avatar: primeiro tenta Discord vinculado, senão usa perfil
  SELECT
    COALESCE(dl.discord_username, p.username) AS uname,
    COALESCE(dl.discord_avatar_url, p.avatar_url) AS av
    INTO v_username, v_avatar
  FROM public.profiles p
  LEFT JOIN public.discord_links dl ON dl.user_id = p.user_id
  WHERE p.user_id = NEW.user_id;

  IF v_username IS NULL THEN
    RETURN NEW;
  END IF;

  v_url := 'https://xxttwzewtqxvpgefggah.supabase.co/functions/v1/discord-bridge';

  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  IF v_service_key IS NULL THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'type', 'chat_to_discord',
    'username', v_username,
    'avatarUrl', v_avatar,
    'content', NEW.message,
    'userId', NEW.user_id
  );

  BEGIN
    PERFORM extensions.http_post(
      url := v_url,
      body := v_payload::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Discord replication failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- 5. Schedule every minute (unschedule first so re-runs don't duplicate the job).
--    The HTTP call only happens when the vault secret exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'discord-chat-sync';
    PERFORM cron.schedule(
      'discord-chat-sync',
      '* * * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://xxttwzewtqxvpgefggah.supabase.co/functions/v1/discord-chat-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', s.decrypted_secret
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      )
      FROM vault.decrypted_secrets s
      WHERE s.name = 'discord_chat_sync_secret';
      $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed: discord-chat-sync job not scheduled';
  END IF;
END $$;
