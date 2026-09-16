/**
 * DuelVerse - Resumo do Battle Pass no perfil
 */
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Crown, Trophy } from "lucide-react";
import { useBattlePass, getNextLevelInfo } from "@/hooks/useBattlePass";

export const BattlePassProfileCard = () => {
  const { season, progress, has_pro, levels, loading } = useBattlePass();

  if (loading || !season) return null;

  const info = getNextLevelInfo(levels, progress.wins);

  return (
    <Card className="card-mystic animate-fade-in-up">
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Battle Pass — {season.name}
            </p>
            <p className="text-lg font-bold">
              Level {info.currentLevel}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                <Trophy className="mr-1 inline h-3.5 w-3.5" />
                {progress.wins} vitórias
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {has_pro && (
              <Badge className="gap-1">
                <Crown className="h-3 w-3" /> PRO
              </Badge>
            )}
            <Link to="/ranking?tab=battlepass" className="text-xs text-primary underline-offset-4 hover:underline">
              Ver progresso
            </Link>
          </div>
        </div>
        <Progress value={info.percent} className="h-1.5" />
        {info.nextLevel && (
          <p className="text-xs text-muted-foreground">
            Faltam {info.missing} vitórias para o level {info.nextLevel}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
