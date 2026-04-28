-- Create function to update timestamps (if not exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create saved_decks table for storing user decks
CREATE TABLE public.saved_decks (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    main_deck JSONB NOT NULL DEFAULT '[]',
    extra_deck JSONB NOT NULL DEFAULT '[]',
    side_deck JSONB NOT NULL DEFAULT '[]',
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes
CREATE INDEX idx_saved_decks_user_id ON public.saved_decks(user_id);
CREATE INDEX idx_saved_decks_public ON public.saved_decks(is_public) WHERE is_public = true;

-- Enable RLS
ALTER TABLE public.saved_decks ENABLE ROW LEVEL SECURITY;

-- Users can view their own decks
CREATE POLICY "Users can view their own decks"
ON public.saved_decks
FOR SELECT
USING (auth.uid() = user_id);

-- Users can view public decks
CREATE POLICY "Anyone can view public decks"
ON public.saved_decks
FOR SELECT
USING (is_public = true);

-- Users can create their own decks
CREATE POLICY "Users can create their own decks"
ON public.saved_decks
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own decks
CREATE POLICY "Users can update their own decks"
ON public.saved_decks
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own decks
CREATE POLICY "Users can delete their own decks"
ON public.saved_decks
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_saved_decks_updated_at
BEFORE UPDATE ON public.saved_decks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();