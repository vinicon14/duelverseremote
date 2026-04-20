-- Add tokens_deck column to saved_decks table
ALTER TABLE public.saved_decks
ADD COLUMN tokens_deck JSONB NOT NULL DEFAULT '[]';

-- Add comment to explain the column
COMMENT ON COLUMN public.saved_decks.tokens_deck IS 'Stores token cards (ficha) - can contain up to 5 cards, no 3-copy limit';
