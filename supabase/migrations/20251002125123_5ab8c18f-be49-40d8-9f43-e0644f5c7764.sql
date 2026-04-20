-- Atualizar referências de chat_messages para live_duels
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_game_session_id_fkey;

ALTER TABLE chat_messages
ADD CONSTRAINT chat_messages_game_session_id_fkey 
FOREIGN KEY (game_session_id) 
REFERENCES live_duels(id) 
ON DELETE CASCADE;

-- Habilitar realtime para chat_messages
ALTER TABLE chat_messages REPLICA IDENTITY FULL;

-- Adicionar chat_messages à publicação realtime se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
  END IF;
END $$;

-- Habilitar realtime para live_duels
ALTER TABLE live_duels REPLICA IDENTITY FULL;

-- Adicionar live_duels à publicação realtime se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'live_duels'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE live_duels;
  END IF;
END $$;