/**
 * DuelVerse - Coleta de XP diário
 * Card compacto para coletar o XP diário direto da página inicial.
 */
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTcg } from "@/contexts/TcgContext";
import { useToast } from "@/hooks/use-toast";
import { getTcgDisplayName } from "@/utils/tcgDisplay";
import { DAILY_XP_REWARDS } from "@/utils/xpRewards";

const getTodayKey = () => new Date().toISOString().slice(0, 10);

export const DailyXpClaim = () => {
  const { activeTcg, activeProfile, refreshProfiles } = useTcg();
  const { toast } = useToast();
  const [claiming, setClaiming] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);

  const stats = useMemo(() => {
    const total = activeProfile?.xp_total || 0;
    const level = activeProfile?.xp_level || Math.floor(total / 100) + 1;
    const currentProgress = Math.max(total - (level - 1) * 100, 0);
    const lastClaim = activeProfile?.xp_last_daily_claim
      ? new Date(activeProfile.xp_last_daily_claim).toISOString().slice(0, 10)
      : null;
    return {
      total,
      level,
      percent: Math.min(100, Math.max(0, currentProgress)),
      claimedToday: lastClaim === getTodayKey() || justClaimed,
    };
  }, [activeProfile, justClaimed]);

  if (!activeProfile) return null;

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const { data, error } = await supabase.rpc("claim_daily_xp", {
        _tcg_type: activeTcg,
        _amount: DAILY_XP_REWARDS.login,
      } as any);
      if (error) throw error;

      const row: any = Array.isArray(data) ? data[0] : data;
      if (row?.claimed === true) {
        setJustClaimed(true);
        toast({
          title: `✨ +${DAILY_XP_REWARDS.login} XP coletados!`,
          description: row?.leveled_up
            ? `Subiu para o nível ${row?.new_level} em ${getTcgDisplayName(activeTcg)}!`
            : `Total: ${row?.new_total} XP em ${getTcgDisplayName(activeTcg)}`,
        });
      } else {
        setJustClaimed(true);
        toast({ title: "XP diário", description: "Você já coletou hoje. Volte em 24h!" });
      }
      await refreshProfiles();
    } catch (error: any) {
      toast({
        title: "Erro ao coletar XP",
        description: error?.message ?? "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setClaiming(false);
    }
  };

  return (
    <Card className="card-mystic">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold">XP diário</h3>
          </div>
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            Nível {stats.level}
          </span>
        </div>

        <div className="space-y-1">
          <Progress value={stats.percent} className="h-2" />
          <p className="text-xs text-muted-foreground">{stats.total} XP acumulados</p>
        </div>

        <Button
          className="w-full font-bold uppercase tracking-wider"
          disabled={claiming || stats.claimedToday}
          onClick={handleClaim}
        >
          {claiming ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : stats.claimedToday ? (
            <Check className="w-4 h-4 mr-2" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          {stats.claimedToday ? "Coletado hoje" : `Coletar +${DAILY_XP_REWARDS.login} XP`}
        </Button>
      </CardContent>
    </Card>
  );
};
