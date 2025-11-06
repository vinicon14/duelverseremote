-- Criar tabela para mensagens de chat dos torneios
CREATE TABLE IF NOT EXISTS public.tournament_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tournament_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Usuários podem ver mensagens de torneios"
  ON public.tournament_chat_messages
  FOR SELECT
  USING (true);

CREATE POLICY "Usuários podem enviar mensagens em torneios"
  ON public.tournament_chat_messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas próprias mensagens"
  ON public.tournament_chat_messages
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins podem deletar qualquer mensagem"
  ON public.tournament_chat_messages
  FOR DELETE
  USING (is_admin(auth.uid()));

-- Adicionar à publicação realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_chat_messages;