-- Adicionar coluna room_name na tabela live_duels
ALTER TABLE public.live_duels 
ADD COLUMN IF NOT EXISTS room_name TEXT;

-- Criar tabela para chat global
CREATE TABLE IF NOT EXISTS public.global_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.global_chat_messages ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para chat global
CREATE POLICY "Todos podem ver mensagens do chat global"
  ON public.global_chat_messages
  FOR SELECT
  USING (true);

CREATE POLICY "Usuários podem enviar mensagens no chat global"
  ON public.global_chat_messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas próprias mensagens"
  ON public.global_chat_messages
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins podem deletar qualquer mensagem"
  ON public.global_chat_messages
  FOR DELETE
  USING (is_admin(auth.uid()));

-- Adicionar índice para performance
CREATE INDEX IF NOT EXISTS idx_global_chat_created_at 
  ON public.global_chat_messages(created_at DESC);

-- Habilitar realtime para chat global
ALTER PUBLICATION supabase_realtime ADD TABLE public.global_chat_messages;