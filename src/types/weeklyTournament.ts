export interface WeeklyTournamentWithCount {
  id: string;
  name: string;
  description: string | null;
  prize_pool: number;
  entry_fee: number;
  max_participants: number;
  start_date: string;
  end_date: string;
  status: string;
  creator_id: string;
  created_at: string;
  participant_count: number;
  total_collected: number;
  prize_paid: boolean;
  is_weekly?: boolean;
  isFull?: boolean;
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
