import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { detectPlatform } from "@/utils/platformDetection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

/**
 * /join/:duelId — Roteador inteligente para entrar em uma sala.
 *
 * - App nativo DuelVerse (UA "DuelVerseApp")  → /duel/:id direto
 * - Usuário autenticado no site               → /duel/:id direto
 * - Discord embed (UA contém "Discord")       → tenta abrir o app DuelVerse
 *                                                via discord:// e cai no /auth
 * - Visitante sem conta                       → /auth com returnTo=/duel/:id
 *                                                (após login pode entrar em
 *                                                modo casual)
 */
const JoinDuel = () => {
  const { duelId } = useParams<{ duelId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "needs_auth" | "discord" | "missing">(
    "checking",
  );

  useEffect(() => {
    const route = async () => {
      if (!duelId) {
        setStatus("missing");
        return;
      }

      const platform = detectPlatform();
      const ua = navigator.userAgent || "";
      const isDiscord = /Discord/i.test(ua);

      // Verifica se a sala existe
      const { data: duel } = await supabase
        .from("live_duels")
        .select("id, status")
        .eq("id", duelId)
        .maybeSingle();

      if (!duel) {
        setStatus("missing");
        return;
      }

      // Sessão atual?
      const { data: { session } } = await supabase.auth.getSession();

      // 1. App nativo DuelVerse → vai direto
      if (platform.isNativeApp) {
        navigate(`/duel/${duelId}`, { replace: true });
        return;
      }

      // 2. Logado no site → vai direto
      if (session?.user) {
        navigate(`/duel/${duelId}`, { replace: true });
        return;
      }

      // 3. Discord embed → mostra opções
      if (isDiscord) {
        setStatus("discord");
        return;
      }

      // 4. Visitante → precisa autenticar
      setStatus("needs_auth");
    };

    route();
  }, [duelId, navigate]);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "missing") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Sala não encontrada</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Esta sala de duelo não existe mais ou já foi encerrada.
            </p>
            <Button onClick={() => navigate("/duels")} className="w-full">
              Ver salas disponíveis
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "discord") {
    const siteUrl = `https://duelverse.site/duel/${duelId}`;
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Entrar na sala de duelo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground">
              Escolha como deseja entrar:
            </p>
            <Button
              className="w-full"
              onClick={() => navigate(`/auth?returnTo=/duel/${duelId}`)}
            >
              Tenho conta no DuelVerse
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => navigate(`/duel/${duelId}?role=spectate`)}
            >
              Entrar como casual (espectador)
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(siteUrl, "_blank")}
            >
              Abrir no navegador
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // needs_auth
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Entrar na sala de duelo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground">
            Faça login para entrar nesta sala, ou entre como casual.
          </p>
          <Button
            className="w-full"
            onClick={() => navigate(`/auth?returnTo=/duel/${duelId}`)}
          >
            Entrar / Criar conta
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => navigate(`/duel/${duelId}?role=spectate`)}
          >
            Assistir como casual
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinDuel;
