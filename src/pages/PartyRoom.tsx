/**
 * DuelVerse - Sala Party
 * Grade de vídeos sem limite de participantes, com chat da sala.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LogOut,
  Maximize,
  MessageCircle,
  Mic,
  MicOff,
  MoreVertical,
  Send,
  Users,
  Video as VideoIcon,
  VideoOff,
  Volume2,
  Trash2,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { usePartyMesh } from "@/hooks/usePartyMesh";
import { useBanCheck } from "@/hooks/useBanCheck";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PAGE_SIZE = 9;

interface ChatLine {
  id: string;
  username: string;
  message: string;
}

const VideoTile = ({
  stream,
  label,
  muted,
  avatarUrl,
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  avatarUrl?: string | null;
}) => {
  const ref = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hasVideo = Boolean(stream?.getVideoTracks().some((t) => t.readyState === "live"));

  useEffect(() => {
    if (ref.current && stream && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
      ref.current.play().catch(() => undefined);
    }
  }, [stream]);

  const goFullscreen = () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      el.requestFullscreen?.().catch(() => toast.error("Tela cheia não disponível neste dispositivo"));
    }
  };

  return (
    <div ref={wrapperRef} className="group relative aspect-video overflow-hidden rounded-xl border border-border bg-muted/40 fullscreen:aspect-auto fullscreen:rounded-none fullscreen:border-0">
      {hasVideo ? (
        <video ref={ref} autoPlay playsInline muted={muted} className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Avatar className="h-16 w-16">
            <AvatarImage src={avatarUrl ?? undefined} />
            <AvatarFallback>{label.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        </div>
      )}
      <span className="absolute bottom-2 left-2 max-w-[calc(100%-3.5rem)] truncate rounded-md border border-border/70 bg-background/85 px-2 py-1 text-xs font-medium backdrop-blur-md">
        {label}
      </span>
      <button
        type="button"
        onClick={goFullscreen}
        aria-label="Tela cheia"
        className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-lg border border-border/70 bg-background/85 text-foreground opacity-90 backdrop-blur-md transition-opacity hover:opacity-100 sm:h-8 sm:w-8 sm:opacity-0 sm:group-hover:opacity-90"
      >
        <Maximize className="h-4 w-4" />
      </button>
    </div>
  );
};

export default function PartyRoom() {
  useBanCheck();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState("Jogador");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [room, setRoom] = useState<{ name: string; description: string | null; host_id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const chatChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const mesh = usePartyMesh({
    roomId: id ?? "",
    userId: userId ?? "",
    username,
    avatarUrl,
  });

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth", { state: { returnTo: `/party/${id}` } });
        return;
      }
      setUserId(session.user.id);

      const [{ data: profile }, { data: roomData }] = await Promise.all([
        supabase.from("profiles").select("username, avatar_url").eq("user_id", session.user.id).maybeSingle(),
        supabase.from("party_rooms").select("name, description, host_id, is_active, is_private").eq("id", id).maybeSingle(),
      ]);

      if (profile) {
        setUsername(profile.username);
        setAvatarUrl(profile.avatar_url);
      }
      if (!roomData || !roomData.is_active) {
        toast.error("Esta sala não está mais disponível");
        navigate("/party");
        return;
      }
      if ((roomData as any).is_private && roomData.host_id !== session.user.id && !(location.state as any)?.verified) {
        toast.error("Sala privada: entre pela lista informando a senha");
        navigate("/party");
        return;
      }
      setRoom(roomData as any);

      await supabase
        .from("party_participants")
        .upsert(
          { room_id: id, user_id: session.user.id, left_at: null },
          { onConflict: "room_id,user_id" },
        );
      setLoading(false);
    };
    if (id) init();
  }, [id, navigate]);

  // Chat da sala (efêmero, via broadcast)
  useEffect(() => {
    if (!id) return;
    const channel = supabase.channel(`party-chat-${id}`, { config: { broadcast: { self: true } } });
    channel
      .on("broadcast", { event: "msg" }, ({ payload }) => {
        setChat((prev) => [...prev.slice(-80), payload as ChatLine]);
      })
      .subscribe();
    chatChannelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      chatChannelRef.current = null;
    };
  }, [id]);

  const leaveRoom = useCallback(async () => {
    if (userId && id) {
      await supabase
        .from("party_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("room_id", id)
        .eq("user_id", userId);
    }
    navigate("/party");
  }, [id, navigate, userId]);

  // Marca saída ao fechar a aba/desmontar, para a sala esvaziar corretamente
  useEffect(() => {
    if (!id || !userId) return;
    const markLeft = () => {
      supabase
        .from("party_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("room_id", id)
        .eq("user_id", userId)
        .then(() => undefined);
    };
    window.addEventListener("beforeunload", markLeft);
    return () => {
      window.removeEventListener("beforeunload", markLeft);
      markLeft();
    };
  }, [id, userId]);

  const deleteRoom = useCallback(async () => {
    if (!id) return;
    if (!confirm("Excluir esta sala Party? Todos serão removidos.")) return;
    const { error } = await supabase.rpc("delete_party_room", { _room_id: id });
    if (error) {
      toast.error("Não foi possível excluir a sala");
      return;
    }
    toast.success("Sala excluída");
    navigate("/party");
  }, [id, navigate]);

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    chatChannelRef.current?.send({
      type: "broadcast",
      event: "msg",
      payload: { id: crypto.randomUUID(), username, message: text },
    });
    setChatInput("");
  };

  const allTiles = useMemo(
    () => [
      { key: "local", label: `${username} (você)`, stream: mesh.localStream, muted: true, avatarUrl },
      ...mesh.peers.map((p) => ({
        key: p.userId,
        label: p.username,
        stream: p.stream,
        muted: false,
        avatarUrl: p.avatarUrl,
      })),
    ],
    [avatarUrl, mesh.localStream, mesh.peers, username],
  );

  const totalPages = Math.max(1, Math.ceil(allTiles.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleTiles = allTiles.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-transparent">
      <div className="container mx-auto px-3 py-3 sm:py-4 pb-28 sm:pb-4">
        <header className="mb-3 flex items-center justify-between gap-2 sm:mb-4 sm:flex-wrap">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={leaveRoom} aria-label="Voltar">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold uppercase sm:text-xl sm:normal-case">{room?.name}</h1>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                <Users className="h-3 w-3" /> {allTiles.length} na sala
              </div>
              {room?.description && (
                <p className="hidden max-w-xl truncate text-xs text-muted-foreground sm:block">{room.description}</p>
              )}
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3 w-3" /> {allTiles.length}
            </Badge>
            <Button
              variant={mesh.cameraOn ? "default" : "outline"}
              size="sm"
              onClick={() => mesh.toggleCamera().catch(() => toast.error("Não foi possível acessar a câmera"))}
            >
              {mesh.cameraOn ? <VideoIcon className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            </Button>
            <Button
              variant={mesh.micOn ? "default" : "outline"}
              size="sm"
              onClick={() => mesh.toggleMic().catch(() => toast.error("Não foi possível acessar o microfone"))}
            >
              {mesh.micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const url = `${window.location.origin}/party/${id}`;
                try {
                  if (navigator.share) {
                    await navigator.share({ title: room?.name || "Party DuelVerse", url });
                  } else {
                    await navigator.clipboard.writeText(url);
                    toast.success("Link copiado!");
                  }
                } catch {
                  try { await navigator.clipboard.writeText(url); toast.success("Link copiado!"); } catch {}
                }
              }}
            >
              <Share2 className="mr-1 h-4 w-4" /> Compartilhar
            </Button>
            <Button variant="destructive" size="sm" onClick={leaveRoom}>
              <LogOut className="mr-1 h-4 w-4" /> Sair
            </Button>
            {room?.host_id === userId && (
              <Button variant="destructive" size="sm" onClick={deleteRoom}>
                <Trash2 className="mr-1 h-4 w-4" /> Excluir sala
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1 sm:hidden">
            <Button variant="ghost" size="icon" onClick={() => setMobileChatOpen((open) => !open)} aria-label="Abrir chat">
              <MessageCircle className="h-5 w-5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Mais opções">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onSelect={async () => {
                    const url = `${window.location.origin}/party/${id}`;
                    try {
                      if (navigator.share) await navigator.share({ title: room?.name || "Party DuelVerse", url });
                      else {
                        await navigator.clipboard.writeText(url);
                        toast.success("Link copiado!");
                      }
                    } catch {
                      try { await navigator.clipboard.writeText(url); toast.success("Link copiado!"); } catch {}
                    }
                  }}
                >
                  <Share2 className="mr-2 h-4 w-4" /> Compartilhar
                </DropdownMenuItem>
                {room?.host_id === userId && (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={deleteRoom}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir sala
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {mesh.audioBlocked && (
          <Button variant="secondary" className="mb-3 w-full" onClick={mesh.unlockAudio}>
            <Volume2 className="mr-2 h-4 w-4" /> Toque para ativar o som da sala
          </Button>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleTiles.map((tile) => (
                <VideoTile
                  key={tile.key}
                  stream={tile.stream}
                  label={tile.label}
                  muted={tile.muted}
                  avatarUrl={tile.avatarUrl}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-center gap-3">
                <Button variant="outline" size="icon" onClick={() => setPage(Math.max(0, currentPage - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {currentPage + 1} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <Card className={`${mobileChatOpen ? "flex" : "hidden"} h-[45dvh] flex-col border-border/80 p-3 sm:flex sm:h-[60vh] lg:h-[calc(100dvh-140px)]`}>
            <p className="mb-2 text-sm font-semibold">Chat da sala</p>
            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {chat.map((line) => (
                <p key={line.id} className="text-sm">
                  <span className="font-semibold text-primary">{line.username}: </span>
                  <span className="text-muted-foreground">{line.message}</span>
                </p>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="Mensagem"
                maxLength={300}
              />
              <Button size="icon" onClick={sendChat} aria-label="Enviar">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </div>

        <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-sm items-center justify-between gap-2 rounded-2xl border border-border/80 bg-card/95 p-2 shadow-elevated backdrop-blur-xl sm:hidden">
          <div className="flex gap-1">
            <Button
              variant={mesh.micOn ? "default" : "outline"}
              size="icon"
              className="h-12 w-12 rounded-xl"
              onClick={() => mesh.toggleMic().catch(() => toast.error("Não foi possível acessar o microfone"))}
              aria-label={mesh.micOn ? "Desligar microfone" : "Ligar microfone"}
            >
              {mesh.micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </Button>
            <Button
              variant={mesh.cameraOn ? "default" : "outline"}
              size="icon"
              className="h-12 w-12 rounded-xl"
              onClick={() => mesh.toggleCamera().catch(() => toast.error("Não foi possível acessar a câmera"))}
              aria-label={mesh.cameraOn ? "Desligar câmera" : "Ligar câmera"}
            >
              {mesh.cameraOn ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </Button>
            <Button variant="outline" size="icon" className="relative h-12 w-12 rounded-xl" onClick={() => setMobileChatOpen((open) => !open)} aria-label="Abrir chat">
              <MessageCircle className="h-5 w-5" />
              {chat.length > 0 && !mobileChatOpen && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />}
            </Button>
          </div>
          <Button variant="destructive" className="h-12 rounded-xl px-4" onClick={leaveRoom}>
            <LogOut className="h-5 w-5" />
            <span className="text-xs font-bold uppercase">Sair</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
