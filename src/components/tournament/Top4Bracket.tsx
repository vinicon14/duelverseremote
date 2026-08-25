/**
 * DuelVerse - Visualização do bracket Top 4 (Suíço + Mata-Mata)
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";

interface BracketMatch {
  id: string;
  round: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  status: string | null;
  player1?: { username?: string }[];
  player2?: { username?: string }[];
}

interface Top4BracketProps {
  matches: BracketMatch[];
  swissRounds: number;
}

const nameOf = (m: BracketMatch, slot: 1 | 2) =>
  (slot === 1 ? m.player1?.[0]?.username : m.player2?.[0]?.username) || "TBD";

function MatchLine({ match, label }: { match?: BracketMatch; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/70 p-3 min-w-[190px]">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{label}</p>
      {!match ? (
        <p className="text-sm text-muted-foreground italic">Aguardando definição</p>
      ) : (
        <div className="space-y-1">
          {([1, 2] as const).map((slot) => {
            const id = slot === 1 ? match.player1_id : match.player2_id;
            const won = !!match.winner_id && match.winner_id === id;
            return (
              <div
                key={slot}
                className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-sm ${
                  won ? "bg-primary/15 font-bold text-foreground" : "text-foreground/80"
                }`}
              >
                <span className="truncate">{nameOf(match, slot)}</span>
                {won && <Trophy className="w-3.5 h-3.5 text-primary shrink-0" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Top4Bracket({ matches, swissRounds }: Top4BracketProps) {
  const semis = matches.filter((m) => m.round === swissRounds + 1);
  const final = matches.find((m) => m.round === swissRounds + 2);

  if (semis.length === 0 && !final) return null;

  const champion =
    final?.winner_id && final.winner_id === final.player1_id
      ? nameOf(final, 1)
      : final?.winner_id === final?.player2_id && final?.winner_id
      ? nameOf(final!, 2)
      : null;

  return (
    <Card className="card-mystic">
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-xl">
          <Trophy className="w-5 h-5 text-primary" />
          Fase 2 — Top 4 / Mata-Mata
          {champion && (
            <Badge className="bg-primary/20 text-primary border border-primary/40">Campeão: {champion}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 overflow-x-auto">
          <div className="flex flex-col gap-3">
            <MatchLine match={semis[0]} label="Semifinal 1 — 1º x 4º" />
            <MatchLine match={semis[1]} label="Semifinal 2 — 2º x 3º" />
          </div>
          <div className="hidden sm:block h-px w-8 bg-border" />
          <MatchLine match={final} label="Final" />
        </div>
      </CardContent>
    </Card>
  );
}
