-- Remove tokens_deck column - tokens will be managed as part of extra deck
ALTER TABLE public.saved_decks
DROP COLUMN IF EXISTS tokens_deck;
