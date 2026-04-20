
-- Add requires_decklist column to tournaments
ALTER TABLE public.tournaments ADD COLUMN requires_decklist boolean NOT NULL DEFAULT false;

-- Create tournament_decklists table
CREATE TABLE public.tournament_decklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  image_url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, user_id)
);

ALTER TABLE public.tournament_decklists ENABLE ROW LEVEL SECURITY;

-- Users can view their own decklists
CREATE POLICY "Users can view own decklists"
ON public.tournament_decklists FOR SELECT
USING (auth.uid() = user_id);

-- Tournament creators can view decklists of their tournaments
CREATE POLICY "Creators can view tournament decklists"
ON public.tournament_decklists FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = tournament_decklists.tournament_id
    AND t.created_by = auth.uid()
  )
);

-- Admins full access
CREATE POLICY "Admins manage decklists"
ON public.tournament_decklists FOR ALL
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Users can insert their own decklist
CREATE POLICY "Users can insert own decklist"
ON public.tournament_decklists FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own decklist
CREATE POLICY "Users can update own decklist"
ON public.tournament_decklists FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own decklist
CREATE POLICY "Users can delete own decklist"
ON public.tournament_decklists FOR DELETE
USING (auth.uid() = user_id);

-- Create storage bucket for decklist images
INSERT INTO storage.buckets (id, name, public) VALUES ('tournament-decklists', 'tournament-decklists', true);

-- Storage policies
CREATE POLICY "Anyone can view decklist images"
ON storage.objects FOR SELECT
USING (bucket_id = 'tournament-decklists');

CREATE POLICY "Authenticated users can upload decklist images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'tournament-decklists' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update own decklist images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'tournament-decklists' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own decklist images"
ON storage.objects FOR DELETE
USING (bucket_id = 'tournament-decklists' AND auth.uid()::text = (storage.foldername(name))[1]);
