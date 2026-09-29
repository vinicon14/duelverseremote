import { supabase } from "@/integrations/supabase/client";

/**
 * Retorna o ID do usuário da sessão ATUAL (renovando-a se preciso).
 * Evita inserts com IDs em cache que violam RLS quando a sessão expirou.
 */
export async function getFreshUserId(): Promise<string> {
  let { data: { session } } = await supabase.auth.getSession();
  const expiresSoon = session?.expires_at ? session.expires_at * 1000 - Date.now() < 60_000 : true;
  if (!session || expiresSoon) {
    const { data } = await supabase.auth.refreshSession();
    session = data.session;
  }
  if (!session?.user?.id) {
    const returnTo = window.location.pathname + window.location.search;
    window.location.assign(`/auth?returnTo=${encodeURIComponent(returnTo)}`);
    throw new Error("Sua sessão expirou, entre novamente.");
  }
  return session.user.id;
}
