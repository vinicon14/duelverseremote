-- =====================================================================
-- Remove o trigger replicate_chat_to_discord (redundante e quebrado)
-- Idempotente.
-- =====================================================================
-- Todos os caminhos que inserem mensagens 'app' em global_chat_messages já
-- chamam a discord-bridge (chat_to_discord) por conta própria com o JWT do
-- usuário: GlobalChat.tsx (sendMessage) e utils/announceDuelRoom.ts.
-- O trigger mandava a service_role como Bearer; desde o PR #99 a bridge exige
-- JWT de usuário ou x-bot-secret, então ele só gerava 401 (e, antes do #99,
-- duplicava cada mensagem no Discord). Ele também fazia um HTTP síncrono
-- (extensions.http_post) dentro de cada INSERT.
-- A função continua existindo (com o guard de source_type='discord' da
-- migration 20261002090000) caso precise ser religada.

DROP TRIGGER IF EXISTS trg_replicate_chat_to_discord ON public.global_chat_messages;

DO $$
BEGIN
  IF to_regprocedure('public.replicate_chat_to_discord()') IS NOT NULL THEN
    COMMENT ON FUNCTION public.replicate_chat_to_discord() IS
      'Desativada (trigger removido em 20261002120000): GlobalChat e announceDuelRoom chamam discord-bridge via functions.invoke';
  END IF;
END $$;
