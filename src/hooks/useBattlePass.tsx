/**
 * DuelVerse - Hook do Battle Pass
 *
 * Carrega temporada ativa, progresso do jogador, níveis, recompensas e missões.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BattlePassReward {
  id: string;
  track: "free" | "pro";
  reward_type: string;
  title: string;
  description: string | null;
  image_url: string | null;
  amount: number;
  claimed: boolean;
}

export interface BattlePassLevel {
  level: number;
  wins_required: number;
  rewards: BattlePassReward[];
}

export interface BattlePassMission {
  id: string;
  scope: "daily" | "weekly" | "season";
  metric: string;
  title: string;
  goal: number;
  reward_duelcoins: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export interface BattlePassSeason {
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

export interface BattlePassOverview {
  season: BattlePassSeason | null;
  progress: { wins: number; duels_played: number; tournament_wins: number; level: number };
  has_pro: boolean;
  levels: BattlePassLevel[];
  missions: BattlePassMission[];
}

const EMPTY: BattlePassOverview = {
  season: null,
  progress: { wins: 0, duels_played: 0, tournament_wins: 0, level: 1 },
  has_pro: false,
  levels: [],
  missions: [],
};

export const useBattlePass = (seasonId?: string | null) => {
  const [data, setData] = useState<BattlePassOverview>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: result, error } = await supabase.rpc("bp_get_overview", {
      p_season_id: seasonId ?? null,
    } as any);
    if (!error && result) {
      const parsed = result as unknown as BattlePassOverview;
      setData({ ...EMPTY, ...parsed, season: parsed.season ?? null });
    }
    setLoading(false);
  }, [seasonId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return { ...data, loading, reload: load };
};

export const getNextLevelInfo = (levels: BattlePassLevel[], wins: number) => {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  const current = sorted.filter((l) => l.wins_required <= wins).pop() || sorted[0];
  const next = sorted.find((l) => l.wins_required > wins) || null;
  const base = current?.wins_required ?? 0;
  const target = next?.wins_required ?? base;
  const percent = next ? Math.min(100, Math.max(0, ((wins - base) / Math.max(target - base, 1)) * 100)) : 100;
  return {
    currentLevel: current?.level ?? 1,
    nextLevel: next?.level ?? null,
    nextRequirement: next?.wins_required ?? null,
    missing: next ? Math.max(next.wins_required - wins, 0) : 0,
    percent,
  };
};
