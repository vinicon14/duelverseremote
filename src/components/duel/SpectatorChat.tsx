/**
 * DuelVerse - Chat de Espectadores (estilo Twitch)
 *
 * Mensagens minimalistas (somente texto, sem fundo) que somem após alguns segundos.
 * Espectadores podem ler e escrever; jogadores apenas leem.
 * Contador de espectadores aparece somente quando há pelo menos 1.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Eye, History, Send } from "lucide-react";

interface SpectatorChatProps {
  duelId: string;
  currentUserId?: string;
  /** true = pode enviar mensagens. */
  canSend: boolean;
  /** Identifica o usuário como espectador para o contador de presença. */
  isSpectator: boolean;
  /** IDs dos jogadores da partida (mensagens deles aparecem maiores e por mais tempo). */
  playerIds?: (string | null | undefined)[];
}

interface ChatMsg {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  username?: string;
  isPlayer?: boolean;
}

const VISIBLE_MS = 9000;
const PLAYER_VISIBLE_MS = 20000;

export const SpectatorChat = ({ duelId, currentUserId, canSend, isSpectator, playerIds = [] }: SpectatorChatProps) => {
  const playerSet = new Set(playerIds.filter(Boolean) as string[]);
  const playerSetRef = useRef(playerSet);
  playerSetRef.current = playerSet;
  const [history, setHistory] = useState<ChatMsg[]>([]);
  const [visible, setVisible] = useState<ChatMsg[]>([]);
  const [spectatorCount, setSpectatorCount] = useState(0);
  const [text, setText] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const namesRef = useRef<Map<string, string>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  const resolveName = useCallback(async (userId: string) => {
    if (namesRef.current.has(userId)) return namesRef.current.get(userId)!;
    const { data } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", userId)
      .maybeSingle();
    const name = data?.username || "Anônimo";
    namesRef.current.set(userId, name);
    return name;
  }, []);

  // Histórico inicial
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, user_id, message, created_at")
        .eq("duel_id", duelId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (cancelled || !data) return;
      const ids = [...new Set(data.map((m) => m.user_id))];
      if (ids.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, username")
          .in("user_id", ids);
        profiles?.forEach((p) => namesRef.current.set(p.user_id, p.username));
      }
      setHistory(
        data.map((m) => ({
          ...m,
          username: namesRef.current.get(m.user_id) || "Anônimo",
          isPlayer: playerSetRef.current.has(m.user_id),
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [duelId]);

  // Novas mensagens em tempo real
  useEffect(() => {
    const channel = supabase
      .channel(`spectator-chat-${duelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `duel_id=eq.${duelId}`,
        },
        async (payload) => {
          const raw = payload.new as ChatMsg;
          const username = await resolveName(raw.user_id);
          const isPlayer = playerSetRef.current.has(raw.user_id);
          const msg: ChatMsg = { ...raw, username, isPlayer };
          setHistory((prev) => [...prev, msg]);
          setVisible((prev) => [...prev.slice(-6), msg]);
          setTimeout(() => {
            setVisible((prev) => prev.filter((m) => m.id !== msg.id));
          }, isPlayer ? PLAYER_VISIBLE_MS : VISIBLE_MS);
        },

      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [duelId, resolveName]);

  // Presença de espectadores
  useEffect(() => {
    const channel = supabase.channel(`duel-spectators-${duelId}`, {
      config: { presence: { key: currentUserId || crypto.randomUUID() } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, Array<{ spectator?: boolean }>>;
        const count = Object.values(state).filter((entries) =>
          entries.some((e) => e.spectator),
        ).length;
        setSpectatorCount(count);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ spectator: isSpectator });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [duelId, currentUserId, isSpectator]);

  useEffect(() => {
    if (!historyOpen) return;
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, 50);
  }, [historyOpen, history]);

  const send = async () => {
    const value = text.trim();
    if (!value || !currentUserId) return;
    setText("");
    await supabase.from("chat_messages").insert({
      duel_id: duelId,
      user_id: currentUserId,
      message: value.slice(0, 200),
    });
  };

  return (
    <div className="pointer-events-none fixed bottom-20 right-3 z-40 flex w-[min(78vw,320px)] flex-col items-end gap-1">
      {/* Mensagens efêmeras */}
      <div className="flex w-full flex-col items-end gap-0.5">
        {visible.map((m) => (
          <p
            key={m.id}
            className={`animate-fade-in max-w-full text-right leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${
              m.isPlayer
                ? "text-sm font-medium text-foreground"
                : "text-[11px] text-foreground/90"
            }`}
          >
            <span className={m.isPlayer ? "font-bold text-amber-400" : "font-semibold text-primary"}>
              {m.username}
            </span>{" "}
            <span className="break-words">{m.message}</span>
          </p>
        ))}
      </div>

      {/* Barra minimalista */}
      <div className="pointer-events-auto flex items-center gap-1">
        {spectatorCount > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Eye className="h-3 w-3" />
            {spectatorCount}
          </span>
        )}

        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-70 hover:opacity-100">
              <History className="h-3.5 w-3.5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">Histórico do chat</DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-72 pr-3">
              <div ref={scrollRef} className="space-y-1">
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma mensagem ainda.</p>
                ) : (
                  history.map((m) => (
                    <p key={m.id} className="text-xs leading-snug">
                      <span className="font-semibold text-primary">{m.username}</span>{" "}
                      <span className="break-words text-foreground/90">{m.message}</span>
                    </p>
                  ))
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>

      {/* Entrada apenas para espectadores */}
      {canSend && (
        <div className="pointer-events-auto flex w-full items-center gap-1">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            maxLength={200}
            placeholder="Enviar mensagem..."
            className="h-7 border-border/40 bg-background/40 text-[11px] backdrop-blur-sm"
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 opacity-70 hover:opacity-100"
            onClick={send}
            disabled={!text.trim()}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
};
