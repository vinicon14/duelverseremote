/**
 * Matchmaking invite acceptor.
 * URL pattern: /m/:inviteId
 *
 * - If the user is logged in, calls the accept-match-invite edge function.
 * - If matched, redirects to /duel/:duelId.
 * - If not logged in, redirects to /auth with a returnTo so they come back here.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MatchInvite = () => {
  const { inviteId } = useParams<{ inviteId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [message, setMessage] = useState<string>("Conectando ao matchmaking…");

  useEffect(() => {
    if (!inviteId) {
      setStatus("error");
      setMessage("Convite inválido");
      return;
    }

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        // Bounce through /auth and come back
        navigate("/auth", {
          replace: true,
          state: { returnTo: `/m/${inviteId}` },
        });
        return;
      }

      try {
        setMessage("Pareando com o anfitrião…");
        const { data, error } = await supabase.functions.invoke(
          "accept-match-invite",
          { body: { invite_id: inviteId } },
        );
        if (error) throw error;

        if (data?.duel_id && (data.status === "matched" || data.status === "already_matched")) {
          navigate(`/duel/${data.duel_id}`, { replace: true });
          return;
        }

        if (data?.status === "self") {
          toast({
            title: "Esse é o seu convite",
            description: "Aguarde alguém clicar para parear.",
          });
          navigate("/matchmaking", { replace: true });
          return;
        }

        if (data?.status === "expired") {
          toast({
            title: "Convite expirado",
            description: "O anfitrião precisa buscar partida novamente.",
            variant: "destructive",
          });
          navigate("/matchmaking", { replace: true });
          return;
        }

        if (data?.status === "matched" === false || data?.status) {
          toast({
            title: "Convite indisponível",
            description: data?.message || data?.status,
            variant: "destructive",
          });
          navigate("/matchmaking", { replace: true });
          return;
        }

        throw new Error("Resposta inesperada do servidor");
      } catch (err: any) {
        console.error("[MatchInvite] failed:", err);
        setStatus("error");
        setMessage(err.message || "Falha ao aceitar convite");
      }
    })();
  }, [inviteId, navigate, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        {status === "loading" ? (
          <>
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
            <p className="text-foreground/80">{message}</p>
          </>
        ) : (
          <>
            <p className="text-destructive font-medium">{message}</p>
            <button
              className="text-sm text-primary underline"
              onClick={() => navigate("/matchmaking")}
            >
              Voltar para o matchmaking
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default MatchInvite;
