/**
 * DuelVerse - Sala Party
 * Grade de vídeos sem limite de participantes, com chat da sala.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  Mic,
  MicOff,
  Send,
  Users,
  Video as VideoIcon,
  VideoOff,
  Volume2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { usePartyMesh } from "@/hooks/usePartyMesh";
import { useBanCheck } from "@/hooks/useBanCheck";

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
    <div ref={wrapperRef} className="group relative aspect-video overflow-hidden rounded-lg border border-border bg-muted/40 fullscreen:aspect-auto fullscreen:rounded-none fullscreen:border-0">
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
      <span className="absolute bottom-2 left-2 rounded bg-background/80 px-2 py-0.5 text-xs font-medium">
        {label}
      </span>
      <button
        type="button"
        onClick={goFullscreen}
        aria-label="Tela cheia"
        className="absolute right-2 top-2 rounded bg-background/80 p-1.5 text-foreground opacity-80 transition-opacity hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-90"
      >
        <Maximize className="h-4 w-4" />
      </button>
    </div>
  );
};

export default function PartyRoom() {
  useBanCheck();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState("Jogador");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [room, setRoom] = useState<{ name: string; description: string | null; host_id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [chatInput, setChatInput] = useState("");
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
        navigate("/auth");
        return;
      }
      setUserId(session.user.id);

      const [{ data: profile }, { data: roomData }] = await Promise.all([
        supabase.from("profiles").select("username, avatar_url").eq("user_id", session.user.id).maybeSingle(),
        supabase.from("party_rooms").select("name, description, host_id, is_active").eq("id", id).maybeSingle(),
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
      <div className="container mx-auto px-3 py-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={leaveRoom} aria-label="Voltar">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">{room?.name}</h1>
              {room?.description && (
                <p className="text-xs text-muted-foreground">{room.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
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
            <Button variant="destructive" size="sm" onClick={leaveRoom}>
              <LogOut className="mr-1 h-4 w-4" /> Sair
            </Button>
            {room?.host_id === userId && (
              <Button variant="destructive" size="sm" onClick={deleteRoom}>
                <Trash2 className="mr-1 h-4 w-4" /> Excluir sala
              </Button>
            )}
          </div>
        </div>

        {mesh.audioBlocked && (
          <Button variant="secondary" className="mb-3 w-full" onClick={mesh.unlockAudio}>
            <Volume2 className="mr-2 h-4 w-4" /> Toque para ativar o som da sala
          </Button>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div>
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

          <Card className="flex h-[60vh] flex-col p-3 lg:h-[calc(100dvh-140px)]">
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
      </div>
    </div>
  );
}
