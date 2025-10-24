ALTER TABLE public.matchmaking_queue
ADD COLUMN duel_id UUID REFERENCES public.live_duels(id) ON DELETE SET NULL;
