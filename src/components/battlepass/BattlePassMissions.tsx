/**
 * DuelVerse - Missões do Battle Pass
 */
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Check, Coins } from "lucide-react";
import type { BattlePassMission } from "@/hooks/useBattlePass";

const SCOPE_LABEL: Record<string, string> = {
  daily: "Diárias",
  weekly: "Semanais",
  season: "Temporada",
};

interface Props {
  missions: BattlePassMission[];
  onClaim: (missionId: string) => void;
  claiming: string | null;
}

export const BattlePassMissions = ({ missions, onClaim, claiming }: Props) => {
  const scopes: Array<BattlePassMission["scope"]> = ["daily", "weekly", "season"];

  if (missions.length === 0) return null;

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Missões</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {scopes.map((scope) => {
          const list = missions.filter((m) => m.scope === scope);
          if (list.length === 0) return null;
          return (
            <Card key={scope} className="card-mystic">
              <CardContent className="space-y-4 pt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {SCOPE_LABEL[scope]}
                </p>
                {list.map((mission) => {
                  const percent = Math.min(100, (mission.progress / Math.max(mission.goal, 1)) * 100);
                  return (
                    <div key={mission.id} className="space-y-2 rounded-lg border border-border/60 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium">{mission.title}</span>
                        {mission.reward_duelcoins > 0 && (
                          <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
                            <Coins className="h-3 w-3" />
                            {mission.reward_duelcoins}
                          </Badge>
                        )}
                      </div>
                      <Progress value={percent} className="h-1.5" />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {Math.min(mission.progress, mission.goal)} / {mission.goal}
                        </span>
                        {mission.claimed ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Check className="h-3 w-3" /> Resgatada
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant={mission.completed ? "default" : "ghost"}
                            disabled={!mission.completed || claiming === mission.id}
                            onClick={() => onClaim(mission.id)}
                            className="h-7 text-xs"
                          >
                            Resgatar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
