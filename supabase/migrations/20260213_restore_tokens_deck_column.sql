-- Restore tokens_deck column to saved_decks table
-- Tokens are stored separately in deck builder (max 5 cards, no 3-copy limit)
-- but will be merged with extra deck during duel gameplay
ALTER TABLE public.saved_decks
ADD COLUMN IF NOT EXISTS tokens_deck JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN public.saved_decks.tokens_deck IS 'Stores token cards (ficha) - can contain up to 5 cards, no 3-copy limit, separate field in deck builder but merged with extra deck during duel';
