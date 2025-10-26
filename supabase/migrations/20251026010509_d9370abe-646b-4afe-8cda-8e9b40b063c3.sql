-- Adicionar campo para controlar quantas streams ativas existem por duelo
ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS duel_id uuid REFERENCES live_duels(id) ON DELETE CASCADE;

-- Criar índice para buscar streams por duel_id
CREATE INDEX IF NOT EXISTS idx_live_streams_duel_id ON live_streams(duel_id);

-- Garantir que apenas uma stream ativa por duelo
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_stream_per_duel 
ON live_streams(duel_id) 
WHERE status = 'active';

-- Atualizar RLS policies para live_streams para permitir que participantes do duelo iniciem streams
DROP POLICY IF EXISTS "Apenas admins podem criar streams" ON live_streams;

CREATE POLICY "Participantes podem criar streams de seus duelos"
ON live_streams
FOR INSERT
WITH CHECK (
  is_admin(auth.uid()) OR
  (duel_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM live_duels 
    WHERE id = duel_id 
    AND (creator_id = auth.uid() OR opponent_id = auth.uid())
  ))
);

CREATE POLICY "Participantes podem atualizar streams de seus duelos"
ON live_streams
FOR UPDATE
USING (
  is_admin(auth.uid()) OR
  (duel_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM live_duels 
    WHERE id = duel_id 
    AND (creator_id = auth.uid() OR opponent_id = auth.uid())
  ))
);