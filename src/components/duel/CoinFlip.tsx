import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Coins } from "lucide-react";

export interface CoinFlipState {
  starter_id: string;
  flipper_id: string;
  ts: number;
}

interface Props {
  duelId: string;
  coinFlip: CoinFlipState | null;
  creatorId?: string | null;
  creatorName?: string | null;
  opponentId?: string | null;
  opponentName?: string | null;
  currentUserId?: string | null;
  canFlip: boolean;
}

const FLIP_MS = 2200;

export const CoinFlip = ({
  duelId,
  coinFlip,
  creatorId,
  creatorName,
  opponentId,
  opponentName,
  currentUserId,
  canFlip,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"flipping" | "done">("flipping");
  const lastTs = useRef<number>(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ts = coinFlip?.ts;
    if (!ts || ts === lastTs.current) return;
    // Ignora jogadas antigas ao entrar na sala
    if (Date.now() - ts > 60000) { lastTs.current = ts; return; }
    lastTs.current = ts;
    setPhase("flipping");
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPhase("done"), FLIP_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [coinFlip?.ts]);

  const flip = async () => {
    if (!creatorId || !opponentId || !currentUserId) return;
    const starter = Math.random() < 0.5 ? creatorId : opponentId;
    const state: CoinFlipState = { starter_id: starter, flipper_id: currentUserId, ts: Date.now() };
    const { error } = await supabase
      .from("live_duels")
      .update({ coin_flip: state } as any)
      .eq("id", duelId);
    if (error) return;
    // O realtime sincroniza com o outro jogador; aqui refletimos localmente
    lastTs.current = state.ts;
    setPhase("flipping");
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPhase("done"), FLIP_MS);
  };

  const isCreatorStarter = coinFlip?.starter_id === creatorId;
  const starterName = isCreatorStarter
    ? creatorName || "Jogador 1"
    : opponentName || "Jogador 2";
  const side = isCreatorStarter ? "CARA" : "COROA";

  return (
    <>
      {canFlip && creatorId && opponentId && (
        <Button
          onClick={flip}
          variant="outline"
          size="sm"
          className="bg-yellow-500/95 hover:bg-yellow-600 text-white backdrop-blur-sm text-xs sm:text-sm"
          title="Cara ou coroa — quem começa"
          aria-label="Cara ou coroa"
        >
          <Coins className="w-3 h-3 sm:w-4 sm:h-4" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader>
            <DialogTitle className="text-center">Cara ou Coroa</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            <div
              className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold border-4 border-yellow-400 bg-gradient-to-br from-yellow-300 to-amber-500 text-amber-900 shadow-lg ${
                phase === "flipping" ? "animate-[coinflip_0.35s_linear_infinite]" : ""
              }`}
              style={{ transformStyle: "preserve-3d" }}
            >
              {phase === "flipping" ? "🪙" : side === "CARA" ? "👤" : "👑"}
            </div>

            {phase === "flipping" ? (
              <p className="text-sm text-muted-foreground animate-pulse">Girando a moeda…</p>
            ) : (
              <div className="space-y-1">
                <p className="text-lg font-bold">{side}!</p>
                <p className="text-base">
                  <span className="font-semibold text-primary">{starterName}</span> começa o duelo!
                </p>
              </div>
            )}

            {phase === "done" && canFlip && (
              <Button variant="outline" size="sm" onClick={flip}>
                Jogar novamente
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CoinFlip;
