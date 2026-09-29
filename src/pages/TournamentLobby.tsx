import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { usePartyMesh } from "@/hooks/usePartyMesh";
import { ArrowLeft, Mic, MicOff, Video, VideoOff, Pause, Play, Users, Swords, Timer, Send, Trophy } from "lucide-react";
import { toast } from "sonner";

interface LobbyState {
  success: boolean;
  message?: string;
  is_organizer: boolean;
  status: string;
  round: number;
  finished: boolean;
  countdown_ends_at: string | null;
  is_paused: boolean;
  paused_remaining: number | null;
  server_now: string;
  required: string[];
  present: { user_id: string; username: string | null; avatar_url: string | null }[];
  my_status: string | null;
  matches: {
    id: string; table_number: number | null; duel_id: string | null; status: string;
    player1_id: string | null; player2_id: string | null; winner_id: string | null;
    p1: string | null; p2: string | null;
  }[];
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Tile({ stream, name, muted }: { stream: MediaStream | null; name: string; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return (
    <div className="relative aspect-video rounded-lg overflow-hidden bg-muted border border-border">
      {stream && stream.getVideoTracks().length > 0 ? (
        <video ref={ref} autoPlay playsInline muted={muted} className="w-full h-full object-contain" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
          {name.slice(0, 2).toUpperCase()}
        </div>
      )}
      <span className="absolute bottom-1 left-1 text-xs px-2 py-0.5 rounded bg-background/80">{name}</span>
    </div>
  );
}

export default function TournamentLobby() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [me, setMe] = useState<{ id: string; username: string; avatar: string | null } | null>(null);
  const [state, setState] = useState<LobbyState | null>(null);
  const [tName, setTName] = useState("");
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [chat, setChat] = useState<{ u: string; m: string }[]>([]);
  const [msg, setMsg] = useState("");
  const chatRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const sentToTable = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth", { state: { returnTo: `/tournaments/${id}/lobby` } }); return; }
      const { data: p } = await supabase.from("profiles").select("username, avatar_url").eq("user_id", session.user.id).maybeSingle();
      setMe({ id: session.user.id, username: p?.username || "Jogador", avatar: p?.avatar_url || null });
      const { data: t } = await supabase.from("tournaments").select("name").eq("id", id!).maybeSingle();
      setTName(t?.name || "Torneio");
    })();
  }, [id, navigate]);

  const tick = useCallback(async () => {
    if (!id) return;
    const { data, error } = await (supabase as any).rpc("lobby_tick", { p_tournament_id: id });
    if (error) return;
    const s = data as LobbyState;
    if (!s.success) { toast.error(s.message || "Sem acesso a este lobby"); navigate(`/tournaments/${id}`); return; }
    setOffset(new Date(s.server_now).getTime() - Date.now());
    setState(s);
  }, [id, navigate]);

  useEffect(() => {
    if (!me) return;
    tick();
    const i = setInterval(tick, 3000);
    const c = setInterval(() => setNow(Date.now()), 500);
    return () => { clearInterval(i); clearInterval(c); };
  }, [me, tick]);

  // Envia o jogador à sua mesa quando ela é criada
  useEffect(() => {
    if (!state || !me) return;
    const mine = state.matches.find((m) => m.duel_id && m.status !== "completed" && (m.player1_id === me.id || m.player2_id === me.id));
    if (mine?.duel_id && sentToTable.current !== mine.duel_id) {
      sentToTable.current = mine.duel_id;
      toast.success(`Sua mesa: Mesa ${mine.table_number}`);
      navigate(`/duel/${mine.duel_id}`);
    }
  }, [state, me, navigate]);

  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`tlobby-chat-${id}`);
    ch.on("broadcast", { event: "msg" }, ({ payload }) => setChat((c) => [...c.slice(-99), payload as any])).subscribe();
    chatRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  const mesh = usePartyMesh({ roomId: `tlobby-${id}`, userId: me?.id || "", username: me?.username || "", avatarUrl: me?.avatar });

  const sendMsg = () => {
    const m = msg.trim().slice(0, 300);
    if (!m || !me) return;
    const payload = { u: me.username, m };
    chatRef.current?.send({ type: "broadcast", event: "msg", payload });
    setChat((c) => [...c.slice(-99), payload]);
    setMsg("");
  };

  const setPaused = async (p: boolean) => {
    const { data } = await (supabase as any).rpc("lobby_set_paused", { p_tournament_id: id, p_paused: p });
    if (data && !data.success) toast.error(data.message);
    tick();
  };

  if (!state || !me) {
    return (<><Navbar /><div className="pt-24 text-center text-muted-foreground">Entrando no lobby…</div></>);
  }

  const remaining = state.is_paused
    ? state.paused_remaining
    : state.countdown_ends_at
      ? Math.max(0, Math.ceil((new Date(state.countdown_ends_at).getTime() - (now + offset)) / 1000))
      : null;
  const presentIds = new Set(state.present.map((p) => p.user_id));
  const presentRequired = state.required.filter((u) => presentIds.has(u)).length;
  const myMatch = state.matches.find((m) => m.player1_id === me.id || m.player2_id === me.id);
  const eliminated = state.my_status === "eliminated";
  const isBye = myMatch && (!myMatch.player1_id || !myMatch.player2_id);

  let headline = "Aguardando jogadores";
  if (state.finished || state.status === "completed") headline = "Torneio encerrado";
  else if (state.status !== "active") headline = "O torneio ainda não começou";
  else if (state.matches.length === 0) headline = "Aguardando o organizador gerar o chaveamento";
  else if (state.is_paused) headline = "Contagem pausada pelo organizador";
  else if (remaining !== null) headline = "As mesas serão criadas em";
  else if (state.required.length === 0) headline = "Rodada em andamento — aguardando resultados";

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-3 sm:px-4 pt-20 sm:pt-24 pb-28 sm:pb-12 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/tournaments/${id}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Torneio
          </Button>
          <h1 className="text-lg sm:text-2xl font-bold truncate flex-1">Lobby • {tName}</h1>
          {state.is_organizer && <Badge variant="secondary">Organizador</Badge>}
        </div>

        <Card>
          <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 space-y-1">
              <div className="text-sm text-muted-foreground">Rodada {state.round}</div>
              <div className="text-base sm:text-lg font-semibold">{headline}</div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                Jogadores presentes: {presentRequired}/{state.required.length}
              </div>
              {eliminated && <div className="text-sm text-destructive">Você foi eliminado. Pode continuar assistindo o lobby.</div>}
              {isBye && myMatch?.status === "completed" && <div className="text-sm text-primary">Você recebeu BYE nesta rodada e avança automaticamente.</div>}
              {myMatch?.duel_id && myMatch.status !== "completed" && (
                <Button size="sm" className="mt-2" onClick={() => navigate(`/duel/${myMatch.duel_id}`)}>
                  <Swords className="h-4 w-4 mr-1" /> Ir para Mesa {myMatch.table_number}
                </Button>
              )}
              {state.finished && (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => navigate(`/tournaments/${id}`)}>
                  <Trophy className="h-4 w-4 mr-1" /> Ver classificação
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {remaining !== null && (
                <div className="flex items-center gap-2 text-4xl font-mono font-bold tabular-nums">
                  <Timer className="h-7 w-7 text-primary" /> {fmt(remaining)}
                </div>
              )}
              {state.is_organizer && (remaining !== null || state.is_paused) && (
                <Button variant="outline" size="icon" onClick={() => setPaused(!state.is_paused)} aria-label={state.is_paused ? "Continuar" : "Pausar"}>
                  {state.is_paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <Tile stream={mesh.localStream} name={`${me.username} (você)`} muted />
              {mesh.peers.map((p) => <Tile key={p.userId} stream={p.stream} name={p.username} />)}
            </div>
            {mesh.audioBlocked && <Button size="sm" variant="secondary" onClick={mesh.unlockAudio}>Ativar áudio</Button>}

            <Card>
              <CardContent className="p-4">
                <h2 className="font-semibold mb-2">Mesas da rodada {state.round}</h2>
                {state.matches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum pareamento ainda.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {state.matches.map((m) => {
                      const bye = !m.player1_id || !m.player2_id;
                      return (
                        <li key={m.id} className="flex items-center justify-between gap-2 border-b border-border/50 py-1.5">
                          <span className="text-muted-foreground w-16 shrink-0">{bye ? "BYE" : m.table_number ? `Mesa ${m.table_number}` : "—"}</span>
                          <span className="flex-1 truncate">{m.p1 || "—"} {bye ? "" : `vs ${m.p2 || "—"}`}</span>
                          <Badge variant={m.status === "completed" ? "secondary" : "outline"}>
                            {m.status === "completed" ? "Finalizada" : m.duel_id ? "Jogando" : "Aguardando"}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="flex flex-col h-80 lg:h-auto lg:min-h-[420px]">
            <CardContent className="p-3 flex flex-col flex-1 min-h-0">
              <h2 className="font-semibold mb-2">Chat do lobby</h2>
              <div className="flex-1 overflow-y-auto space-y-1 text-sm">
                {chat.map((c, i) => (<div key={i}><span className="font-semibold text-primary">{c.u}:</span> {c.m}</div>))}
              </div>
              <div className="flex gap-2 mt-2">
                <Input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMsg()} placeholder="Mensagem" maxLength={300} />
                <Button size="icon" onClick={sendMsg} aria-label="Enviar"><Send className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 p-2 flex justify-center gap-3 sm:static sm:border-0 sm:bg-transparent sm:pb-8">
        <Button variant={mesh.micOn ? "default" : "outline"} size="icon" className="h-11 w-11" onClick={mesh.toggleMic} aria-label="Microfone">
          {mesh.micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>
        <Button variant={mesh.cameraOn ? "default" : "outline"} size="icon" className="h-11 w-11" onClick={mesh.toggleCamera} aria-label="Câmera">
          {mesh.cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>
      </div>
    </>
  );
}
