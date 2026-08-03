GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_chat_messages TO authenticated;
GRANT SELECT ON public.tournament_chat_messages TO anon;
GRANT ALL ON public.tournament_chat_messages TO service_role;