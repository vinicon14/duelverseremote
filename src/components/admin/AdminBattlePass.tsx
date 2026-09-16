/**
 * DuelVerse - Admin do Battle Pass
 *
 * Criação e configuração de temporadas, níveis, recompensas, missões,
 * preço do Battle Pass PRO e correção manual de progresso.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";

interface Season {
  id: string;
  name: string;
  season_number: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  max_levels: number;
  count_tournament_wins: boolean;
  pro_price_duelcoins: number;
}

interface Level { id: string; level: number; wins_required: number }
interface Reward {
  id: string; level: number; track: string; reward_type: string; title: string; amount: number;
}
interface Mission {
  id: string; scope: string; metric: string; title: string; goal: number;
  reward_duelcoins: number; is_active: boolean;
}

const REWARD_TYPES = ["duelcoins", "sleeve", "playmat", "badge", "title", "avatar", "frame", "effect", "cosmetic"];
const METRICS = ["wins", "duels", "tournament_wins", "tournaments"];
const SCOPES = ["daily", "weekly", "season"];

export const AdminBattlePass = () => {
  const { toast } = useToast();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState<string>("");
  const [levels, setLevels] = useState<Level[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [players, setPlayers] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [fixUser, setFixUser] = useState("");
  const [fixWins, setFixWins] = useState("0");

  const season = seasons.find((s) => s.id === seasonId);

  const loadSeasons = useCallback(async () => {
    const { data } = await supabase
      .from("battle_pass_seasons")
      .select("*")
      .order("season_number", { ascending: false });
    setSeasons((data as Season[]) || []);
    if (data?.length && !seasonId) setSeasonId(data[0].id);
    setLoading(false);
  }, [seasonId]);

  const loadSeasonData = useCallback(async (id: string) => {
    const [lv, rw, ms, pg] = await Promise.all([
      supabase.from("battle_pass_levels").select("id, level, wins_required").eq("season_id", id).order("level"),
      supabase.from("battle_pass_rewards").select("id, level, track, reward_type, title, amount").eq("season_id", id).order("level"),
      supabase.from("battle_pass_missions").select("*").eq("season_id", id).order("scope"),
      supabase.from("battle_pass_user_progress").select("id", { count: "exact", head: true }).eq("season_id", id),
    ]);
    setLevels((lv.data as Level[]) || []);
    setRewards((rw.data as Reward[]) || []);
    setMissions((ms.data as Mission[]) || []);
    setPlayers(pg.count || 0);
  }, []);

  useEffect(() => { void loadSeasons(); }, [loadSeasons]);
  useEffect(() => { if (seasonId) void loadSeasonData(seasonId); }, [seasonId, loadSeasonData]);

  const notify = (error: any, msg: string) =>
    toast({
      title: error ? "Erro" : "Pronto",
      description: error?.message || msg,
      variant: error ? "destructive" : "default",
    });

  const createSeason = async () => {
    const nextNumber = (seasons[0]?.season_number || 0) + 1;
    const { data, error } = await supabase
      .from("battle_pass_seasons")
      .insert({
        name: `Season ${String(nextNumber).padStart(2, "0")}`,
        season_number: nextNumber,
        ends_at: new Date(Date.now() + 90 * 86400000).toISOString(),
      })
      .select()
      .single();
    notify(error, "Temporada criada");
    if (!error && data) {
      const rows = Array.from({ length: 50 }, (_, idx) => {
        const i = idx + 1;
        const wins = i === 50 ? 150 : i <= 25 ? (i - 1) * 2 : 48 + (i - 25) * 4;
        return { season_id: data.id, level: i, wins_required: wins };
      });
      await supabase.from("battle_pass_levels").insert(rows);
      await loadSeasons();
      setSeasonId(data.id);
    }
  };

  const updateSeason = async (patch: Partial<Season>) => {
    if (!season) return;
    if (patch.is_active) {
      await supabase.from("battle_pass_seasons").update({ is_active: false }).neq("id", season.id);
    }
    const { error } = await supabase.from("battle_pass_seasons").update(patch).eq("id", season.id);
    notify(error, "Temporada atualizada");
    await loadSeasons();
  };

  const saveLevel = async (level: Level) => {
    const { error } = await supabase
      .from("battle_pass_levels")
      .update({ wins_required: level.wins_required })
      .eq("id", level.id);
    notify(error, `Nível ${level.level} atualizado`);
  };

  const saveReward = async (reward: Reward) => {
    const { error } = await supabase
      .from("battle_pass_rewards")
      .update({ title: reward.title, reward_type: reward.reward_type, amount: reward.amount })
      .eq("id", reward.id);
    notify(error, "Recompensa atualizada");
  };

  const addReward = async (level: number, track: string) => {
    const { error } = await supabase.from("battle_pass_rewards").insert({
      season_id: seasonId, level, track, reward_type: "duelcoins", title: "Nova recompensa", amount: 100,
    });
    notify(error, "Recompensa criada");
    void loadSeasonData(seasonId);
  };

  const saveMission = async (mission: Mission) => {
    const { error } = await supabase
      .from("battle_pass_missions")
      .update({
        title: mission.title, goal: mission.goal, metric: mission.metric,
        scope: mission.scope, reward_duelcoins: mission.reward_duelcoins, is_active: mission.is_active,
      })
      .eq("id", mission.id);
    notify(error, "Missão atualizada");
  };

  const addMission = async () => {
    const { error } = await supabase.from("battle_pass_missions").insert({
      season_id: seasonId, scope: "daily", metric: "wins", title: "Nova missão", goal: 1, reward_duelcoins: 50,
    });
    notify(error, "Missão criada");
    void loadSeasonData(seasonId);
  };

  const deleteMission = async (id: string) => {
    const { error } = await supabase.from("battle_pass_missions").delete().eq("id", id);
    notify(error, "Missão removida");
    void loadSeasonData(seasonId);
  };

  const fixProgress = async () => {
    const { data, error } = await supabase.rpc("bp_admin_set_progress", {
      p_season_id: seasonId, p_user_id: fixUser.trim(), p_wins: Number(fixWins) || 0,
    } as any);
    notify(error, (data as any)?.message || "Progresso atualizado");
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card className="card-mystic">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Temporadas</CardTitle>
          <Button size="sm" onClick={createSeason} className="gap-1">
            <Plus className="h-4 w-4" /> Nova temporada
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={seasonId} onValueChange={setSeasonId}>
            <SelectTrigger><SelectValue placeholder="Selecione a temporada" /></SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} {s.is_active ? "• ativa" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {season && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  defaultValue={season.name}
                  onBlur={(e) => e.target.value !== season.name && updateSeason({ name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Preço do Battle Pass PRO (DuelCoins)</Label>
                <Input
                  type="number"
                  defaultValue={season.pro_price_duelcoins}
                  onBlur={(e) => updateSeason({ pro_price_duelcoins: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Início</Label>
                <Input
                  type="datetime-local"
                  defaultValue={season.starts_at.slice(0, 16)}
                  onBlur={(e) => updateSeason({ starts_at: new Date(e.target.value).toISOString() })}
                />
              </div>
              <div className="space-y-2">
                <Label>Encerramento</Label>
                <Input
                  type="datetime-local"
                  defaultValue={season.ends_at.slice(0, 16)}
                  onBlur={(e) => updateSeason({ ends_at: new Date(e.target.value).toISOString() })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <div>
                  <p className="text-sm font-medium">Temporada ativa</p>
                  <p className="text-xs text-muted-foreground">Somente uma temporada fica ativa por vez</p>
                </div>
                <Switch checked={season.is_active} onCheckedChange={(v) => updateSeason({ is_active: v })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <div>
                  <p className="text-sm font-medium">Contar vitórias de torneios</p>
                  <p className="text-xs text-muted-foreground">Vitórias em partidas de torneio somam no Battle Pass</p>
                </div>
                <Switch
                  checked={season.count_tournament_wins}
                  onCheckedChange={(v) => updateSeason({ count_tournament_wins: v })}
                />
              </div>
              <div className="md:col-span-2">
                <Badge variant="outline">{players} jogadores com progresso nesta temporada</Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="card-mystic">
        <CardHeader><CardTitle className="text-base">Níveis e recompensas</CardTitle></CardHeader>
        <CardContent className="max-h-[520px] space-y-3 overflow-y-auto">
          {levels.map((lvl) => (
            <div key={lvl.id} className="space-y-2 rounded-lg border border-border/60 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold">Level {lvl.level}</span>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Vitórias</Label>
                  <Input
                    type="number"
                    className="h-8 w-24"
                    defaultValue={lvl.wins_required}
                    onBlur={(e) => saveLevel({ ...lvl, wins_required: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
              {["free", "pro"].map((track) => {
                const reward = rewards.find((r) => r.level === lvl.level && r.track === track);
                return (
                  <div key={track} className="flex flex-wrap items-center gap-2">
                    <Badge variant={track === "pro" ? "default" : "outline"} className="uppercase">{track}</Badge>
                    {reward ? (
                      <>
                        <Input
                          className="h-8 w-56"
                          defaultValue={reward.title}
                          onBlur={(e) => saveReward({ ...reward, title: e.target.value })}
                        />
                        <Select
                          defaultValue={reward.reward_type}
                          onValueChange={(v) => saveReward({ ...reward, reward_type: v })}
                        >
                          <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {REWARD_TYPES.map((tp) => <SelectItem key={tp} value={tp}>{tp}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          className="h-8 w-24"
                          defaultValue={reward.amount}
                          onBlur={(e) => saveReward({ ...reward, amount: Number(e.target.value) || 0 })}
                        />
                        <Save className="h-3.5 w-3.5 text-muted-foreground" />
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => addReward(lvl.level, track)}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="card-mystic">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Missões</CardTitle>
          <Button size="sm" onClick={addMission} className="gap-1"><Plus className="h-4 w-4" /> Nova missão</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {missions.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 p-3">
              <Input className="h-8 w-56" defaultValue={m.title} onBlur={(e) => saveMission({ ...m, title: e.target.value })} />
              <Select defaultValue={m.scope} onValueChange={(v) => saveMission({ ...m, scope: v })}>
                <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{SCOPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Select defaultValue={m.metric} onValueChange={(v) => saveMission({ ...m, metric: v })}>
                <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{METRICS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" className="h-8 w-20" defaultValue={m.goal}
                onBlur={(e) => saveMission({ ...m, goal: Number(e.target.value) || 1 })} />
              <Input type="number" className="h-8 w-24" defaultValue={m.reward_duelcoins}
                onBlur={(e) => saveMission({ ...m, reward_duelcoins: Number(e.target.value) || 0 })} />
              <Switch checked={m.is_active} onCheckedChange={(v) => saveMission({ ...m, is_active: v })} />
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => deleteMission(m.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="card-mystic">
        <CardHeader><CardTitle className="text-base">Corrigir progresso manualmente</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>ID do usuário</Label>
            <Input className="w-80" value={fixUser} onChange={(e) => setFixUser(e.target.value)} placeholder="uuid" />
          </div>
          <div className="space-y-2">
            <Label>Vitórias</Label>
            <Input type="number" className="w-28" value={fixWins} onChange={(e) => setFixWins(e.target.value)} />
          </div>
          <Button onClick={fixProgress} disabled={!fixUser.trim() || !seasonId}>Aplicar</Button>
        </CardContent>
      </Card>
    </div>
  );
};
