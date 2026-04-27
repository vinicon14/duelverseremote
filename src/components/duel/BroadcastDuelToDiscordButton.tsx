/**
 * BroadcastDuelToDiscordButton
 * Allows the duel participants to announce their live duel in all configured
 * Discord text channels via the bot. The bot posts:
 *   /dv @everyone <username> está transmitindo um duelo: <link>
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Radio } from "lucide-react";

interface Props {
  duelId: string;
}

export const BroadcastDuelToDiscordButton = ({ duelId }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);

  const handleClick = async () => {
    if (loading) return;
    // Throttle: only allow one broadcast per 60s on the client
    if (sentAt && Date.now() - sentAt < 60000) {
      const remaining = Math.ceil((60000 - (Date.now() - sentAt)) / 1000);
      toast({
        title: "Aguarde",
        description: `Você poderá transmitir novamente em ${remaining}s.`,
      });
      return;
    }

    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast({ title: "Faça login", variant: "destructive" });
        return;
      }

      const { data, error } = await supabase.functions.invoke("discord-bridge", {
        body: { type: "broadcast_duel", duelId },
      });

      if (error || (data && data.error)) {
        toast({
          title: "Falha ao transmitir",
          description: error?.message || data?.error || "Tente novamente.",
          variant: "destructive",
        });
        return;
      }

      setSentAt(Date.now());
      toast({
        title: "🎙️ Transmitido no Discord!",
        description: "Os servidores conectados foram notificados.",
      });
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err?.message || "Falha desconhecida.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={loading}
      className="gap-2 bg-[#5865F2]/10 border-[#5865F2]/40 text-[#5865F2] hover:bg-[#5865F2]/20 hover:text-[#5865F2]"
      title="Transmitir esta sala no Discord"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Radio className="w-4 h-4" />
      )}
      <span className="hidden sm:inline">Transmitir no Discord</span>
    </Button>
  );
};
