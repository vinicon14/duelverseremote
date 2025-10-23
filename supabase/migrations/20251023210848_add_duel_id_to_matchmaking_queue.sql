-- ============================================================================
-- ADICIONAR duel_id À TABELA matchmaking_queue
-- ============================================================================

-- Adiciona a coluna `duel_id` à tabela `matchmaking_queue` para associar
-- diretamente uma entrada da fila a um duelo criado. Isso torna o
-- redirecionamento de ambos os jogadores mais robusto e elimina
-- condições de corrida.

ALTER TABLE public.matchmaking_queue
ADD COLUMN duel_id uuid REFERENCES public.live_duels(id) ON DELETE SET NULL;

CREATE INDEX idx_matchmaking_queue_duel_id ON public.matchmaking_queue(duel_id);