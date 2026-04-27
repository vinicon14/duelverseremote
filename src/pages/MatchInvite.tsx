import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Loader2, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function MatchInvite() {
  const { inviteId } = useParams<{ inviteId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [message, setMessage] = useState("Formando partida...");

  useEffect(() => {
    const acceptInvite = async () => {
      if (!inviteId) {
        navigate("/matchmaking", { replace: true });
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth", { replace: true, state: { returnTo: location.pathname } });
        return;
      }

      const { data, error } = await supabase.functions.invoke("accept-match-invite", {
        body: { inviteId },
      });

      if (error) {
        setMessage("Não foi possível entrar nessa partida.");
        toast.error(error.message || "Convite indisponível");
        return;
      }

      if (data?.duelId) {
        toast.success("Match encontrado!");
        navigate(`/duel/${data.duelId}`, { replace: true });
        return;
      }

      setMessage(data?.message || "Esse convite não está mais disponível.");
    };

    acceptInvite();
  }, [inviteId, location.pathname, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex items-center justify-center p-4">
      <Card className="card-mystic w-full max-w-md p-8 text-center space-y-5">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Swords className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold gradient-text">Matchmaking DuelVerse</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        {message === "Formando partida..." ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
        ) : (
          <Button onClick={() => navigate("/matchmaking")} className="w-full btn-mystic">
            Buscar outra partida
          </Button>
        )}
      </Card>
    </div>
  );
}