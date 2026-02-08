-- Add tokens_deck column to saved_decks table
ALTER TABLE public.saved_decks
ADD COLUMN IF NOT EXISTS tokens_deck jsonb NOT NULL DEFAULT '[]'::jsonb;