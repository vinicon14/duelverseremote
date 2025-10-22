CREATE TABLE public.redirects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    duel_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
