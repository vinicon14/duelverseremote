/**
 * DuelVerse - Battle Pass
 *
 * Progressão por temporada baseada em vitórias, com trilhas FREE e PRO.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useBattlePass, getNextLevelInfo, type BattlePassReward } from "@/hooks/useBattlePass";
import { BattlePassMissions } from "./BattlePassMissions";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Crown,
  Lock,
  LockOpen,
  Target,
  Trophy,
  Loader2,
} from "lucide-react";

const REWARD_ICON: Record<string, JSX.Element> = {
  duelcoins: <Coins className="h-3.5 w-3.5" />,
};

const RewardCell = ({
  reward,
  unlocked,
  canClaim,
  onClaim,
  claiming,
}: {
  reward?: BattlePassReward;
  unlocked: boolean;
  canClaim: boolean;
  onClaim: (id: string) => void;
  claiming: string | null;
}) => {
  if (!reward) {
    return <div className="h-[86px] rounded-lg border border-dashed border-border/40" />;
  }
  const state = reward.claimed ? "claimed" : unlocked ? "unlocked" : "locked";
  return (
    <div
      className={`flex h-[86px] flex-col justify-between rounded-lg border p-2 transition-colors ${
        state === "claimed"
          ? "border-primary/40 bg-primary/5"
          : state === "unlocked"
            ? "border-primary/30"
            : "border-border/60 opacity-60"
      }`}
    >
      <div className="flex items-start gap-1.5">
        {reward.image_url ? (
          <img
            src={reward.image_url}
            alt={reward.title}
            loading="lazy"
            className="h-8 w-8 shrink-0 rounded object-cover"
          />
        ) : (
          <span className="mt-0.5 text-muted-foreground">
            {REWARD_ICON[reward.reward_type] ?? <Trophy className="h-3.5 w-3.5" />}
          </span>
        )}
        <span className="line-clamp-2 text-[11px] leading-tight">{reward.title}</span>
      </div>
      {state === "claimed" ? (
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Check className="h-3 w-3" /> Resgatado
        </span>
      ) : state === "locked" ? (
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Lock className="h-3 w-3" /> Bloqueado
        </span>
      ) : canClaim ? (
        <Button
          size="sm"
          className="h-6 w-full text-[10px]"
          disabled={claiming === reward.id}
          onClick={() => onClaim(reward.id)}
        >
          Resgatar
        </Button>
      ) : (
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <LockOpen className="h-3 w-3" /> Requer PRO
        </span>
      )}
    </div>
  );
};

export const BattlePass = () => {
  const { toast } = useToast();
  const { season, progress, has_pro, levels, missions, loading, reload } = useBattlePass();
  const [claiming, setClaiming] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  const info = useMemo(() => getNextLevelInfo(levels, progress.wins), [levels, progress.wins]);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const levelRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const didAutoScroll = useRef(false);

  const scrollToLevel = (level: number, behavior: ScrollBehavior = "smooth") => {
    const el = levelRefs.current[level];
    const track = trackRef.current;
    if (!el || !track) return;
    track.scrollTo({ left: el.offsetLeft - track.clientWidth / 2 + el.clientWidth / 2, behavior });
  };

  const scrollByPage = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: dir * Math.max(track.clientWidth * 0.8, 160), behavior: "smooth" });
  };

  useEffect(() => {
    if (didAutoScroll.current || !levels.length) return;
    didAutoScroll.current = true;
    requestAnimationFrame(() => scrollToLevel(info.currentLevel, "auto"));
  }, [levels.length, info.currentLevel]);

  const handleClaimReward = async (rewardId: string) => {
    setClaiming(rewardId);
    const { data, error } = await supabase.rpc("bp_claim_reward", { p_reward_id: rewardId } as any);
    setClaiming(null);
    const res = data as any;
    toast({
      title: error ? "Erro" : res?.success ? "Sucesso" : "Atenção",
      description: error?.message || res?.message,
      variant: error || !res?.success ? "destructive" : "default",
    });
    if (!error && res?.success) void reload();
  };

  const handleClaimMission = async (missionId: string) => {
    setClaiming(missionId);
    const { data, error } = await supabase.rpc("bp_claim_mission", { p_mission_id: missionId } as any);
    setClaiming(null);
    const res = data as any;
    toast({
      title: error ? "Erro" : res?.success ? "Sucesso" : "Atenção",
      description: error?.message || res?.message,
      variant: error || !res?.success ? "destructive" : "default",
    });
    if (!error && res?.success) void reload();
  };

  const handlePurchase = async () => {
    if (!season) return;
    setPurchasing(true);
    const { data, error } = await supabase.rpc("bp_purchase_pro", { p_season_id: season.id } as any);
    setPurchasing(false);
    const res = data as any;
    toast({
      title: error ? "Erro" : res?.success ? "Battle Pass PRO ativado" : "Atenção",
      description: error?.message || res?.message,
      variant: error || !res?.success ? "destructive" : "default",
    });
    if (!error && res?.success) void reload();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!season) {
    return (
      <Card className="card-mystic py-12 text-center">
        <CardContent>
          <Trophy className="mx-auto mb-4 h-12 w-12 text-primary/50" />
          <h2 className="text-lg font-semibold">Nenhuma temporada ativa</h2>
          <p className="text-sm text-muted-foreground">Aguarde o início da próxima temporada do Battle Pass.</p>
        </CardContent>
      </Card>
    );
  }

  const seasonEnded = new Date(season.ends_at).getTime() < Date.now() || !season.is_active;

  return (
    <div className="space-y-8">
      <Card className="card-mystic">
        <CardContent className="space-y-5 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                DuelVerse Battle Pass
              </p>
              <h2 className="text-2xl font-bold text-gradient-mystic sm:text-3xl">
                {season.name}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(season.starts_at).toLocaleDateString()} — {new Date(season.ends_at).toLocaleDateString()}
                {seasonEnded && " • Temporada encerrada"}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="flex items-center justify-end gap-2 text-lg font-semibold">
                  <Trophy className="h-4 w-4 text-secondary" />
                  {progress.wins} vitórias
                </div>
                <p className="text-xs text-muted-foreground">Level {info.currentLevel}</p>
              </div>
              {has_pro ? (
                <Badge className="gap-1">
                  <Crown className="h-3 w-3" /> PRO
                </Badge>
              ) : (
                <Button size="sm" onClick={handlePurchase} disabled={purchasing || seasonEnded} className="gap-1">
                  <Crown className="h-3.5 w-3.5" />
                  PRO · {season.pro_price_duelcoins}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Progress value={info.percent} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Level {info.currentLevel}</span>
              {info.nextLevel ? (
                <span>
                  Próximo nível: {info.nextRequirement} vitórias • faltam {info.missing}
                </span>
              ) : (
                <span>Progressão máxima alcançada</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Recompensas
          </h2>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Bloqueado</span>
            <span className="flex items-center gap-1"><LockOpen className="h-3 w-3" /> Desbloqueado</span>
            <span className="flex items-center gap-1"><Check className="h-3 w-3" /> Resgatado</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Níveis anteriores"
            className="h-9 w-9 shrink-0"
            onClick={() => scrollByPage(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-9 flex-1 gap-1.5 text-xs"
            onClick={() => scrollToLevel(info.currentLevel)}
          >
            <Target className="h-3.5 w-3.5" />
            Ir para o meu nível ({info.currentLevel})
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Próximos níveis"
            className="h-9 w-9 shrink-0"
            onClick={() => scrollByPage(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div
          ref={trackRef}
          className="snap-x snap-mandatory overflow-x-auto overscroll-x-contain pb-3 [-webkit-overflow-scrolling:touch]"
        >
          <div className="flex min-w-max gap-2">
            {levels.map((lvl) => {
              const unlocked = progress.wins >= lvl.wins_required;
              const isCurrent = lvl.level === info.currentLevel;
              const free = lvl.rewards.find((r) => r.track === "free");
              const pro = lvl.rewards.find((r) => r.track === "pro");
              return (
                <div
                  key={lvl.level}
                  ref={(el) => {
                    levelRefs.current[lvl.level] = el;
                  }}
                  className={`w-[132px] shrink-0 snap-center space-y-2 rounded-xl p-1 ${
                    isCurrent ? "bg-primary/10 ring-1 ring-primary/40" : ""
                  }`}
                >
                  <div
                    className={`rounded-lg border px-2 py-1.5 text-center ${
                      unlocked ? "border-primary/40 bg-primary/10" : "border-border/60"
                    }`}
                  >
                    <p className="text-sm font-semibold">Level {lvl.level}</p>
                    <p className="text-[10px] text-muted-foreground">{lvl.wins_required} vitórias</p>
                  </div>
                  <RewardCell
                    reward={free}
                    unlocked={unlocked}
                    canClaim={unlocked}
                    onClaim={handleClaimReward}
                    claiming={claiming}
                  />
                  <RewardCell
                    reward={pro}
                    unlocked={unlocked}
                    canClaim={unlocked && has_pro}
                    onClaim={handleClaimReward}
                    claiming={claiming}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>Linha superior: trilha FREE</span>
          <span>Linha inferior: trilha PRO</span>
        </div>
      </div>

      <BattlePassMissions missions={missions} onClaim={handleClaimMission} claiming={claiming} />
    </div>
  );
};
