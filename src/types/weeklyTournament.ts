import { Database } from "@/integrations/supabase/types";

export type WeeklyTournament = Database["public"]["Tables"]["tournaments"]["Row"] & {
  is_weekly: true;
  total_collected: number;
  prize_paid: boolean;
  participant_count?: number;
};

export interface WeeklyTournamentWithCount extends WeeklyTournament {
  participant_count: number;
}

export interface CreateWeeklyTournamentInput {
  name: string;
  description: string;
  prize_pool: number;
  entry_fee: number;
  max_participants?: number;
}

export interface JoinWeeklyTournamentResult {
  success: boolean;
  message: string;
}

export interface CreateWeeklyTournamentResult {
  success: boolean;
  tournament_id?: string;
  message: string;
}

export interface DistributePrizeResult {
  success: boolean;
  message: string;
}
