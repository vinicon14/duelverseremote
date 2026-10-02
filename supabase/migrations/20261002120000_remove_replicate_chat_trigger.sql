-- =====================================================================
-- Desativa o trigger replicate_chat_to_discord (redundante e falhando com 401)
-- =====================================================================

-- O GlobalChat (src/components/GlobalChat.tsx) já chama discord-bridge via
-- supabase.functions.invoke com autenticação do usuário, tornando o trigger
-- redundante. Além disso, o PR #99 exigiu autenticação na discord-bridge,
-- fazendo o trigger (que usa service_role) retornar 401.

DROP TRIGGER IF EXISTS trg_replicate_chat_to_discord ON public.global_chat_messages;

-- Mantemos a função por enquanto (caso seja necessário restaurar no futuro),
-- mas ela não será mais executada automaticamente.
COMMENT ON FUNCTION public.replicate_chat_to_discord() IS 'Desativada: o GlobalChat agora chama discord-bridge diretamente via functions.invoke';
