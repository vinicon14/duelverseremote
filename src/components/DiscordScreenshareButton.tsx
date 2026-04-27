/**
 * DuelVerse - Botão de Transmissão de Tela para Discord
 * 
 * Permite que o usuário transmita sua tela da DuelRoom para um canal de voz Discord.
 * - Lista os servidores parceiros do DuelVerse disponíveis
 * - Usuário escolhe o servidor de destino
 * - Se outro usuário entrar na sala Discord, seu vídeo é exibido no DuelVerse
 * - Usuário sem conta vinculada entra com nome Discord (sem ranked)
 * - Usuário com conta vinculada entra com nome DuelVerse (ranked disponível)
 */
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Monitor, MonitorOff, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PartnerServer {
  id: string;
  name: string;
  channelId: string;
  inviteLink?: string;
  coverImageUrl?: string;
}

interface DiscordScreenshareButtonProps {
  duelId: string;
  currentUserId: string;
  discordConnection: { discord_id: string; discord_username: string } | null;
  isRanked: boolean;
  onScreenshareStarted?: (guildId: string, channelId: string, inviteLink?: string) => void;
}

export const DiscordScreenshareButton = ({
  duelId,
  currentUserId,
  discordConnection,
  isRanked,
  onScreenshareStarted,
}: DiscordScreenshareButtonProps) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingServers, setLoadingServers] = useState(false);
  const [partnerServers, setPartnerServers] = useState<PartnerServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingServer, setStreamingServer] = useState<PartnerServer | null>(null);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Buscar servidores parceiros ao abrir o modal
  useEffect(() => {
    if (open) {
      fetchPartnerServers();
    }
  }, [open]);

  // Escutar eventos de usuários Discord entrando na sala via Realtime
  useEffect(() => {
    if (!duelId) return;

    const channel = supabase
      .channel(`discord-screenshare-${duelId}`)
      .on("broadcast", { event: "discord_screenshare_started" }, (payload) => {
        const data = payload.payload;
        if (data.userId !== currentUserId) {
          toast({
            title: "📡 Transmissão Discord ativa",
            description: `A partida está sendo transmitida para o Discord.`,
          });
        }
      })
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
  }, [duelId, currentUserId, toast]);

  const fetchPartnerServers = async () => {
    setLoadingServers(true);
    try {
      const { data, error } = await supabase.functions.invoke("discord-voice-handler", {
        body: { type: "get_partner_servers" },
      });

      if (error) throw error;

      setPartnerServers(data?.servers || []);
      if (data?.servers?.length > 0) {
        setSelectedServerId(data.servers[0].id);
      }
    } catch (err: any) {
      console.error("[DiscordScreenshare] Error fetching partner servers:", err);
      toast({
        title: "Erro ao carregar servidores",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoadingServers(false);
    }
  };

  const handleStartScreenshare = async () => {
    if (!selectedServerId) {
      toast({
        title: "Selecione um servidor",
        description: "Escolha um servidor Discord parceiro para transmitir.",
        variant: "destructive",
      });
      return;
    }

    const server = partnerServers.find((s) => s.id === selectedServerId);
    if (!server) return;

    setLoading(true);
    try {
      // Registrar transmissão no backend
      const { data, error } = await supabase.functions.invoke("discord-voice-handler", {
        body: {
          type: "start_screenshare",
          duel_id: duelId,
          user_id: currentUserId,
          guild_id: server.id,
          channel_id: server.channelId,
          discord_invite_link: server.inviteLink,
        },
      });

      if (error) throw error;

      if (data?.success) {
        setIsStreaming(true);
        setStreamingServer(server);
        setOpen(false);

        toast({
          title: "📡 Transmissão iniciada!",
          description: `Sua partida está sendo transmitida para o servidor ${server.name}.`,
        });

        onScreenshareStarted?.(server.id, server.channelId, server.inviteLink);
      } else {
        throw new Error(data?.error || "Falha ao iniciar transmissão");
      }
    } catch (err: any) {
      console.error("[DiscordScreenshare] Error starting screenshare:", err);
      toast({
        title: "Erro ao iniciar transmissão",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStopScreenshare = async () => {
    try {
      // Remover informações de transmissão do duelo
      await supabase
        .from("live_duels")
        .update({
          discord_screenshare_active: false,
        } as any)
        .eq("id", duelId);

      setIsStreaming(false);
      setStreamingServer(null);

      toast({
        title: "Transmissão encerrada",
        description: "A transmissão para o Discord foi encerrada.",
      });
    } catch (err: any) {
      console.error("[DiscordScreenshare] Error stopping screenshare:", err);
    }
  };

  // Se estiver transmitindo, mostrar botão de parar
  if (isStreaming && streamingServer) {
    return (
      <div className="flex items-center gap-2">
        <Badge className="bg-red-500/90 text-white animate-pulse text-xs">
          📡 Ao vivo: {streamingServer.name}
        </Badge>
        {streamingServer.inviteLink && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => window.open(streamingServer.inviteLink, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Abrir Discord
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="bg-red-600/90 hover:bg-red-700 text-white text-xs"
          onClick={handleStopScreenshare}
        >
          <MonitorOff className="w-3 h-3 mr-1" />
          Parar
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="bg-indigo-600/90 hover:bg-indigo-700 text-white backdrop-blur-sm text-xs sm:text-sm"
        onClick={() => {
          if (!discordConnection) {
            toast({
              title: "Discord não conectado",
              description: "Vincule sua conta Discord no perfil para transmitir.",
              variant: "destructive",
            });
            return;
          }
          setOpen(true);
        }}
      >
        <Monitor className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
        Transmitir no Discord
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5 text-indigo-500" />
              Transmitir Partida para Discord
            </DialogTitle>
            <DialogDescription>
              Escolha um servidor parceiro do DuelVerse para transmitir sua partida.
              Outros usuários do Discord poderão assistir e entrar na sala.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Aviso sobre conta vinculada */}
            {discordConnection ? (
              <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-3 text-sm">
                <p className="font-medium text-green-600 dark:text-green-400">
                  ✅ Conta Discord vinculada
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  Você entrará como <strong>{discordConnection.discord_username}</strong>.
                  {isRanked
                    ? " Sistema ranked ativo para esta partida."
                    : " Partida casual."}
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 text-sm">
                <p className="font-medium text-yellow-600 dark:text-yellow-400">
                  ⚠️ Sem conta Discord vinculada
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  Usuários que entrarem pelo Discord serão identificados pelo nome Discord.
                  O sistema ranked não estará disponível para eles.
                </p>
              </div>
            )}

            {/* Aviso sobre usuários Discord entrando */}
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-3 text-sm">
              <p className="font-medium text-blue-600 dark:text-blue-400">
                📺 Como funciona
              </p>
              <ul className="text-muted-foreground text-xs mt-1 space-y-1">
                <li>• Sua tela será visível para quem entrar no canal de voz Discord</li>
                <li>• Se outro usuário entrar na sala Discord, o vídeo dele aparecerá aqui</li>
                <li>• Usuários com conta DuelVerse vinculada entram com nome e ranked</li>
                <li>• Usuários sem conta entram como visitantes (sem ranked)</li>
              </ul>
            </div>

            {/* Seleção de servidor */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Servidor Discord parceiro</label>
              {loadingServers ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Carregando servidores...
                </div>
              ) : partnerServers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum servidor parceiro configurado. Contate o administrador.
                </p>
              ) : (
                <Select value={selectedServerId} onValueChange={setSelectedServerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um servidor" />
                  </SelectTrigger>
                  <SelectContent>
                    {partnerServers.map((server) => (
                      <SelectItem key={server.id} value={server.id}>
                        <div className="flex items-center justify-between w-full gap-2">
                          <div className="flex items-center gap-2">
                            <img
                              src={server.coverImageUrl || `https://cdn.discordapp.com/icons/${server.id}/default_icon.png`}
                              alt={server.name}
                              className="w-5 h-5 rounded-full bg-indigo-500/20"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = "/placeholder.svg";
                              }}
                            />
                            <span>{server.name}</span>
                          </div>
                          {server.inviteLink && (
                            <div 
                              className="p-1 hover:bg-accent rounded-md"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(server.inviteLink, "_blank", "noopener,noreferrer");
                              }}
                            >
                              <ExternalLink className="w-3 h-3 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Botões de ação */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                onClick={handleStartScreenshare}
                disabled={loading || loadingServers || partnerServers.length === 0 || !selectedServerId}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Iniciando...
                  </>
                ) : (
                  <>
                    <Monitor className="w-4 h-4 mr-2" />
                    Iniciar Transmissão
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
