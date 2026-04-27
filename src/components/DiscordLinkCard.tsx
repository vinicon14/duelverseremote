import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Link2, Unlink } from "lucide-react";
import { useSearchParams } from "react-router-dom";

interface DiscordLink {
  discord_id: string;
  discord_username: string;
  discord_global_name: string | null;
  discord_avatar_url: string | null;
  linked_at: string;
}

interface DiscordLinkCardProps {
  embedded?: boolean;
}

export const DiscordLinkCard = ({ embedded = false }: DiscordLinkCardProps) => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [link, setLink] = useState<DiscordLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const fetchLink = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setLoading(false);
      return;
    }

    const { data } = await (supabase as any)
      .from("discord_links")
      .select("discord_id, discord_username, discord_global_name, discord_avatar_url, linked_at")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    setLink(data || null);
    setLoading(false);
  };

  useEffect(() => {
    fetchLink();
  }, []);

  useEffect(() => {
    const status = searchParams.get("discord");
    const message = searchParams.get("message");
    if (!status) return;

    if (status === "success") {
      toast({
        title: "Discord vinculado!",
        description: "Sua conta Discord foi conectada com sucesso.",
      });
      fetchLink();
    } else if (status === "error") {
      const errorMessages: Record<string, string> = {
        discord_already_linked: "Esta conta Discord já está vinculada a outro usuário.",
        state_expired: "A solicitação expirou. Tente novamente.",
        token_exchange_failed: "Falha ao validar com o Discord.",
        user_fetch_failed: "Não foi possível obter dados do Discord.",
        save_failed: "Erro ao salvar a vinculação.",
      };

      toast({
        title: "Erro ao vincular Discord",
        description: errorMessages[message || ""] || message || "Erro desconhecido.",
        variant: "destructive",
      });
    }

    searchParams.delete("discord");
    searchParams.delete("message");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, toast]);

  const handleLink = async () => {
    setWorking(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast({ title: "Faça login primeiro", variant: "destructive" });
        return;
      }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discord-oauth-start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          origin: window.location.origin,
          returnPath: `${window.location.pathname}${window.location.search}` || "/profile",
        }),
      });

      const data = await resp.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: "Erro",
          description: data.error || "Não foi possível iniciar a vinculação.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setWorking(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm("Tem certeza que deseja desvincular sua conta Discord?")) return;

    setWorking(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setWorking(false);
      return;
    }

    const { error } = await (supabase as any)
      .from("discord_links")
      .delete()
      .eq("user_id", userData.user.id);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Discord desvinculado" });
      setLink(null);
    }

    setWorking(false);
  };

  const content = loading ? (
    <div className="flex justify-center py-4">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  ) : link ? (
    <>
      <div className="flex items-center gap-3">
        {link.discord_avatar_url && (
          <img
            src={link.discord_avatar_url}
            alt={link.discord_username}
            className="h-12 w-12 rounded-full"
          />
        )}
        <div className="flex-1">
          <div className="font-semibold">{link.discord_global_name || link.discord_username}</div>
          <div className="text-sm text-muted-foreground">@{link.discord_username}</div>
        </div>
        <Badge variant="default">Vinculado</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Suas mensagens no chat global serão replicadas no Discord com seu nome e avatar Discord.
      </p>
      <Button
        variant="destructive"
        onClick={handleUnlink}
        disabled={working}
        className="w-full"
      >
        {working ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unlink className="h-4 w-4 mr-2" />}
        Desvincular Discord
      </Button>
    </>
  ) : (
    <>
      <p className="text-sm text-muted-foreground">
        Vincule sua conta Discord para que suas mensagens apareçam com seu nome e avatar Discord nos
        servidores conectados, e mensagens enviadas no Discord apareçam no chat global do DuelVerse
        com sua identidade.
      </p>
      <Button onClick={handleLink} disabled={working} className="w-full">
        {working ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
        Vincular Discord
      </Button>
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{content}</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg viewBox="0 0 127.14 96.36" className="h-5 w-5 fill-current">
            <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
          </svg>
          Conta Discord
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{content}</CardContent>
    </Card>
  );
};