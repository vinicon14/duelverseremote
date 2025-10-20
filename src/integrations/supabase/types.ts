export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      advertisements: {
        Row: {
          content: string
          created_at: string
          expires_at: string | null
          id: string
          image_url: string
          is_active: boolean
          link_url: string
          title: string
        }
        Insert: {
          content?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          image_url: string
          is_active?: boolean
          link_url: string
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          image_url?: string
          is_active?: boolean
          link_url?: string
          title?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          created_at: string
          duel_id: string
          id: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duel_id: string
          id?: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          duel_id?: string
          id?: string
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_duel_id_fkey"
            columns: ["duel_id"]
            isOneToOne: false
            referencedRelation: "live_duels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      duel_invites: {
        Row: {
          created_at: string
          duel_id: string
          id: string
          receiver_id: string
          sender_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          duel_id: string
          id?: string
          receiver_id: string
          sender_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          duel_id?: string
          id?: string
          receiver_id?: string
          sender_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "duel_invites_duel_id_fkey"
            columns: ["duel_id"]
            isOneToOne: false
            referencedRelation: "live_duels"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_requests: {
        Row: {
          created_at: string
          id: string
          receiver_id: string
          sender_id: string
          status: Database["public"]["Enums"]["friend_request_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          receiver_id: string
          sender_id: string
          status?: Database["public"]["Enums"]["friend_request_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          receiver_id?: string
          sender_id?: string
          status?: Database["public"]["Enums"]["friend_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_requests_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friend_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      global_chat_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          user_id?: string
        }
        Relationships: []
      }
      live_duels: {
        Row: {
          bet_amount: number
          created_at: string
          creator_id: string
          duration_minutes: number
          finished_at: string | null
          id: string
          is_ranked: boolean
          is_timer_paused: boolean
          opponent_id: string | null
          player1_lp: number
          player2_lp: number
          remaining_seconds: number | null
          room_name: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["game_status"]
          winner_id: string | null
        }
        Insert: {
          bet_amount?: number
          created_at?: string
          creator_id: string
          duration_minutes?: number
          finished_at?: string | null
          id?: string
          is_ranked?: boolean
          is_timer_paused?: boolean
          opponent_id?: string | null
          player1_lp?: number
          player2_lp?: number
          remaining_seconds?: number | null
          room_name?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_status"]
          winner_id?: string | null
        }
        Update: {
          bet_amount?: number
          created_at?: string
          creator_id?: string
          duration_minutes?: number
          finished_at?: string | null
          id?: string
          is_ranked?: boolean
          is_timer_paused?: boolean
          opponent_id?: string | null
          player1_lp?: number
          player2_lp?: number
          remaining_seconds?: number | null
          room_name?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_status"]
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_duels_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "live_duels_opponent_id_fkey"
            columns: ["opponent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "live_duels_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      match_history: {
        Row: {
          bet_amount: number
          id: string
          played_at: string
          player1_id: string
          player1_score: number
          player2_id: string
          player2_score: number
          winner_id: string | null
        }
        Insert: {
          bet_amount?: number
          id?: string
          played_at?: string
          player1_id: string
          player1_score?: number
          player2_id: string
          player2_score?: number
          winner_id?: string | null
        }
        Update: {
          bet_amount?: number
          id?: string
          played_at?: string
          player1_id?: string
          player1_score?: number
          player2_id?: string
          player2_score?: number
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_history_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "match_history_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "match_history_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      matchmaking_queue: {
        Row: {
          expires_at: string
          id: string
          joined_at: string
          match_type: string
          status: string
          user_id: string
        }
        Insert: {
          expires_at: string
          id?: string
          joined_at?: string
          match_type: string
          status?: string
          user_id: string
        }
        Update: {
          expires_at?: string
          id?: string
          joined_at?: string
          match_type?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      news: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          id: string
          image_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      players: {
        Row: {
          duel_id: string
          id: string
          is_ready: boolean
          joined_at: string
          score: number
          user_id: string
        }
        Insert: {
          duel_id: string
          id?: string
          is_ready?: boolean
          joined_at?: string
          score?: number
          user_id: string
        }
        Update: {
          duel_id?: string
          id?: string
          is_ready?: boolean
          joined_at?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_duel_id_fkey"
            columns: ["duel_id"]
            isOneToOne: false
            referencedRelation: "live_duels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          avatar_url: string | null
          created_at: string
          is_banned: boolean
          is_online: boolean
          last_seen: string
          losses: number
          points: number
          updated_at: string
          user_id: string
          username: string
          wins: number
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          created_at?: string
          is_banned?: boolean
          is_online?: boolean
          last_seen?: string
          losses?: number
          points?: number
          updated_at?: string
          user_id: string
          username: string
          wins?: number
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          created_at?: string
          is_banned?: boolean
          is_online?: boolean
          last_seen?: string
          losses?: number
          points?: number
          updated_at?: string
          user_id?: string
          username?: string
          wins?: number
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      tournaments: {
        Row: {
          created_at: string
          description: string | null
          end_date: string
          id: string
          max_participants: number
          name: string
          prize_pool: number
          start_date: string
          status: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date: string
          id?: string
          max_participants: number
          name: string
          prize_pool?: number
          start_date: string
          status?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string
          id?: string
          max_participants?: number
          name?: string
          prize_pool?: number
          start_date?: string
          status?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_empty_duels: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_expired_queue_entries: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      get_leaderboard: {
        Args: { limit_count?: number }
        Returns: {
          avatar_url: string
          losses: number
          points: number
          user_id: string
          username: string
          wins: number
        }[]
      }
      get_user_profile: {
        Args: { p_user_id: string }
        Returns: {
          avatar_url: string
          losses: number
          points: number
          user_id: string
          username: string
          wins: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: {
        Args: { _user_id: string }
        Returns: boolean
      }
      record_match_result: {
        Args: {
          p_bet_amount: number
          p_duel_id: string
          p_player1_id: string
          p_player1_score: number
          p_player2_id: string
          p_player2_score: number
          p_winner_id: string
        }
        Returns: string
      }
      search_users: {
        Args: { limit_count?: number; search_term: string }
        Returns: {
          avatar_url: string
          points: number
          user_id: string
          username: string
        }[]
      }
    }
    Enums: {
      account_type: "free" | "pro"
      app_role: "admin" | "user"
      friend_request_status: "pending" | "accepted" | "rejected"
      game_status: "waiting" | "in_progress" | "finished"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["free", "pro"],
      app_role: ["admin", "user"],
      friend_request_status: ["pending", "accepted", "rejected"],
      game_status: ["waiting", "in_progress", "finished"],
    },
  },
} as const
