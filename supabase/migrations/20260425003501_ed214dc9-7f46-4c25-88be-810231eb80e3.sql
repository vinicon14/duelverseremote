ALTER TABLE public.global_chat_messages
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS source_username text,
  ADD COLUMN IF NOT EXISTS source_avatar_url text,
  ADD COLUMN IF NOT EXISTS discord_user_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'global_chat_messages_source_type_check'
  ) THEN
    ALTER TABLE public.global_chat_messages
      ADD CONSTRAINT global_chat_messages_source_type_check
      CHECK (source_type IN ('app', 'discord'));
  END IF;
END $$;