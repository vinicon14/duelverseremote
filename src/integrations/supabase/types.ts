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
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
      duelcoins_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          receiver_id: string | null
          sender_id: string | null
          tournament_id: string | null
          transaction_type: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          receiver_id?: string | null
          sender_id?: string | null
          tournament_id?: string | null
          transaction_type: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          receiver_id?: string | null
          sender_id?: string | null
          tournament_id?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "duelcoins_transactions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
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
            foreignKeyName: "friend_requests_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friend_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friend_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
      judge_actions: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          judge_id: string
          match_id: string | null
          notes: string | null
          stream_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: string
          judge_id: string
          match_id?: string | null
          notes?: string | null
          stream_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          judge_id?: string
          match_id?: string | null
          notes?: string | null
          stream_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "judge_actions_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "judges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_actions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_logs: {
        Row: {
          created_at: string
          id: string
          judge_id: string | null
          match_id: string
          player_id: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          judge_id?: string | null
          match_id: string
          player_id: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          judge_id?: string | null
          match_id?: string
          player_id?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "judge_logs_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "live_duels"
            referencedColumns: ["id"]
          },
        ]
      }
      judges: {
        Row: {
          active: boolean | null
          assigned_match_id: string | null
          created_at: string | null
          id: string
          total_matches_judged: number | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          assigned_match_id?: string | null
          created_at?: string | null
          id?: string
          total_matches_judged?: number | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          assigned_match_id?: string | null
          created_at?: string | null
          id?: string
          total_matches_judged?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "judges_assigned_match_id_fkey"
            columns: ["assigned_match_id"]
            isOneToOne: false
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "live_duels_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
            foreignKeyName: "live_duels_opponent_id_fkey"
            columns: ["opponent_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "live_duels_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "live_duels_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      lives: {
        Row: {
          daily_room_url: string | null
          finished_at: string | null
          id: string
          match_id: string | null
          started_at: string | null
          status: string | null
          viewer_count: number | null
        }
        Insert: {
          daily_room_url?: string | null
          finished_at?: string | null
          id?: string
          match_id?: string | null
          started_at?: string | null
          status?: string | null
          viewer_count?: number | null
        }
        Update: {
          daily_room_url?: string | null
          finished_at?: string | null
          id?: string
          match_id?: string | null
          started_at?: string | null
          status?: string | null
          viewer_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lives_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "live_duels"
            referencedColumns: ["id"]
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
            foreignKeyName: "match_history_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
            foreignKeyName: "match_history_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "match_history_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "match_history_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      match_recordings: {
        Row: {
          created_at: string | null
          description: string | null
          duel_id: string | null
          duration: number | null
          file_size: number | null
          id: string
          is_public: boolean
          thumbnail_url: string | null
          title: string
          tournament_id: string | null
          user_id: string
          video_url: string
          views: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duel_id?: string | null
          duration?: number | null
          file_size?: number | null
          id?: string
          is_public?: boolean
          thumbnail_url?: string | null
          title: string
          tournament_id?: string | null
          user_id: string
          video_url: string
          views?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duel_id?: string | null
          duration?: number | null
          file_size?: number | null
          id?: string
          is_public?: boolean
          thumbnail_url?: string | null
          title?: string
          tournament_id?: string | null
          user_id?: string
          video_url?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_recordings_duel_id_fkey"
            columns: ["duel_id"]
            isOneToOne: false
            referencedRelation: "live_duels"
            referencedColumns: ["id"]
          },
        ]
      }
      matchmaking_queue: {
        Row: {
          duel_id: string | null
          expires_at: string
          id: string
          joined_at: string
          match_type: string
          status: string
          user_id: string
        }
        Insert: {
          duel_id?: string | null
          expires_at: string
          id?: string
          joined_at?: string
          match_type: string
          status?: string
          user_id: string
        }
        Update: {
          duel_id?: string | null
          expires_at?: string
          id?: string
          joined_at?: string
          match_type?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matchmaking_queue_duel_id_fkey"
            columns: ["duel_id"]
            isOneToOne: false
            referencedRelation: "live_duels"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "news_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          data: Json | null
          id: string
          message: string
          read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id?: string
          message: string
          read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: string
          message?: string
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      private_messages: {
        Row: {
          created_at: string | null
          id: string
          message: string
          read: boolean | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          read?: boolean | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          read?: boolean | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          avatar_url: string | null
          created_at: string
          duelcoins_balance: number
          is_banned: boolean
          is_online: boolean
          last_seen: string
          level: number
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
          duelcoins_balance?: number
          is_banned?: boolean
          is_online?: boolean
          last_seen?: string
          level?: number
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
          duelcoins_balance?: number
          is_banned?: boolean
          is_online?: boolean
          last_seen?: string
          level?: number
          losses?: number
          points?: number
          updated_at?: string
          user_id?: string
          username?: string
          wins?: number
        }
        Relationships: []
      }
      redirects: {
        Row: {
          created_at: string | null
          duel_id: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          duel_id?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          duel_id?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "redirects_duel_id_fkey"
            columns: ["duel_id"]
            isOneToOne: false
            referencedRelation: "live_duels"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_decks: {
        Row: {
          created_at: string
          description: string | null
          extra_deck: Json
          id: string
          is_public: boolean | null
          main_deck: Json
          name: string
          side_deck: Json
          tokens_deck: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          extra_deck?: Json
          id?: string
          is_public?: boolean | null
          main_deck?: Json
          name: string
          side_deck?: Json
          tokens_deck?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          extra_deck?: Json
          id?: string
          is_public?: boolean | null
          main_deck?: Json
          name?: string
          side_deck?: Json
          tokens_deck?: Json
          updated_at?: string
          user_id?: string
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
      tournament_chat_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          tournament_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          tournament_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          tournament_id?: string
          user_id?: string
        }
        Relationships: []
      }
      tournament_match_reports: {
        Row: {
          created_at: string
          id: string
          match_id: string
          reporter_id: string
          result: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          reporter_id: string
          result: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          reporter_id?: string
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_match_reports_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_matches: {
        Row: {
          created_at: string | null
          id: string
          match_deadline: string | null
          player1_id: string | null
          player2_id: string | null
          round: number
          scheduled_at: string | null
          status: string | null
          tournament_id: string
          winner_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          match_deadline?: string | null
          player1_id?: string | null
          player2_id?: string | null
          round: number
          scheduled_at?: string | null
          status?: string | null
          tournament_id: string
          winner_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          match_deadline?: string | null
          player1_id?: string | null
          player2_id?: string | null
          round?: number
          scheduled_at?: string | null
          status?: string | null
          tournament_id?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_participants: {
        Row: {
          id: string
          losses: number | null
          registered_at: string | null
          score: number | null
          seed: number | null
          status: string | null
          tournament_id: string
          user_id: string
          wins: number | null
        }
        Insert: {
          id?: string
          losses?: number | null
          registered_at?: string | null
          score?: number | null
          seed?: number | null
          status?: string | null
          tournament_id: string
          user_id: string
          wins?: number | null
        }
        Update: {
          id?: string
          losses?: number | null
          registered_at?: string | null
          score?: number | null
          seed?: number | null
          status?: string | null
          tournament_id?: string
          user_id?: string
          wins?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_participants_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_players: {
        Row: {
          created_at: string | null
          id: string
          status: string | null
          tournament_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          status?: string | null
          tournament_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          status?: string | null
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          created_at: string
          created_by: string | null
          current_round: number | null
          description: string | null
          end_date: string
          entry_fee: number
          entry_type: string | null
          id: string
          is_weekly: boolean | null
          max_participants: number
          min_participants: number | null
          name: string
          prize_paid: boolean | null
          prize_pool: number
          rules: string | null
          start_date: string
          status: string
          total_collected: number | null
          total_prize: number
          total_rounds: number | null
          tournament_type: string | null
          type: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_round?: number | null
          description?: string | null
          end_date: string
          entry_fee?: number
          entry_type?: string | null
          id?: string
          is_weekly?: boolean | null
          max_participants: number
          min_participants?: number | null
          name: string
          prize_paid?: boolean | null
          prize_pool?: number
          rules?: string | null
          start_date: string
          status?: string
          total_collected?: number | null
          total_prize?: number
          total_rounds?: number | null
          tournament_type?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_round?: number | null
          description?: string | null
          end_date?: string
          entry_fee?: number
          entry_type?: string | null
          id?: string
          is_weekly?: boolean | null
          max_participants?: number
          min_participants?: number | null
          name?: string
          prize_paid?: boolean | null
          prize_pool?: number
          rules?: string | null
          start_date?: string
          status?: string
          total_collected?: number | null
          total_prize?: number
          total_rounds?: number | null
          tournament_type?: string | null
          type?: string | null
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
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          description: string | null
          duration_days: number
          duration_type: Database["public"]["Enums"]["plan_duration_type"]
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          name: string
          price_duelcoins: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_days?: number
          duration_type?: Database["public"]["Enums"]["plan_duration_type"]
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          name: string
          price_duelcoins: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_days?: number
          duration_type?: Database["public"]["Enums"]["plan_duration_type"]
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          name?: string
          price_duelcoins?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          is_active: boolean
          plan_id: string
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          is_active?: boolean
          plan_id: string
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          is_active?: boolean
          plan_id?: string
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null
          losses: number | null
          points: number | null
          user_id: string | null
          username: string | null
          wins: number | null
        }
        Insert: {
          avatar_url?: string | null
          losses?: number | null
          points?: number | null
          user_id?: string | null
          username?: string | null
          wins?: number | null
        }
        Update: {
          avatar_url?: string | null
          losses?: number | null
          points?: number | null
          user_id?: string | null
          username?: string | null
          wins?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_cleanup_orphaned_auth_users: {
        Args: never
        Returns: {
          deleted_email: string
          deleted_user_id: string
          status: string
        }[]
      }
      admin_manage_duelcoins: {
        Args: {
          p_amount: number
          p_operation: string
          p_reason?: string
          p_user_id: string
        }
        Returns: Json
      }
      calculate_level_from_points: {
        Args: { p_points: number }
        Returns: number
      }
      cleanup_empty_duels: { Args: never; Returns: undefined }
      cleanup_expired_queue_entries: { Args: never; Returns: undefined }
      cleanup_matchmaking_queue: { Args: never; Returns: undefined }
      cleanup_orphaned_users: {
        Args: never
        Returns: {
          deleted_count: number
          deleted_emails: string[]
        }[]
      }
      create_normal_tournament: {
        Args: {
          p_description: string
          p_end_date: string
          p_entry_fee: number
          p_max_participants: number
          p_name: string
          p_prize_pool: number
          p_start_date: string
          p_tournament_type?: string
        }
        Returns: Json
      }
      create_notification: {
        Args: {
          p_data?: Json
          p_message: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      create_weekly_tournament: {
        Args: {
          p_description: string
          p_entry_fee: number
          p_max_participants?: number
          p_name: string
          p_prize_pool: number
        }
        Returns: Json
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
      get_my_created_tournaments: {
        Args: never
        Returns: {
          created_at: string
          id: string
          is_weekly: boolean
          name: string
          participant_count: number
          prize_paid: boolean
          prize_pool: number
          status: string
          total_collected: number
        }[]
      }
      get_my_tournaments: {
        Args: never
        Returns: {
          created_at: string
          created_by: string
          current_round: number
          id: string
          is_weekly: boolean
          name: string
          status: string
        }[]
      }
      get_tournament_opponents: {
        Args: { p_tournament_id: string }
        Returns: {
          match_id: string
          opponent_id: string
          opponent_username: string
          round: number
          status: string
        }[]
      }
      get_tournament_participants: {
        Args: { p_tournament_id: string }
        Returns: {
          avatar_url: string
          is_online: boolean
          joined_at: string
          user_id: string
          username: string
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
      get_weekly_tournaments: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_video_views: { Args: { video_id: string }; Returns: undefined }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_direct_video_access: { Args: never; Returns: boolean }
      is_judge: { Args: { _user_id: string }; Returns: boolean }
      join_weekly_tournament: {
        Args: { p_tournament_id: string }
        Returns: Json
      }
      matchmake: {
        Args: { p_match_type: string; p_user_id: string }
        Returns: {
          duel_id: string
          player_role: string
        }[]
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
      set_match_winner: {
        Args: { p_match_id: string; p_winner_id: string }
        Returns: Json
      }
      sync_storage_recordings: { Args: never; Returns: undefined }
      transfer_duelcoins: {
        Args: { p_amount: number; p_receiver_id: string }
        Returns: Json
      }
    }
    Enums: {
      account_type: "free" | "pro"
      app_role: "admin" | "user" | "judge"
      friend_request_status: "pending" | "accepted" | "rejected"
      game_status: "waiting" | "in_progress" | "finished"
      plan_duration_type: "weekly" | "monthly" | "yearly"
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
      app_role: ["admin", "user", "judge"],
      friend_request_status: ["pending", "accepted", "rejected"],
      game_status: ["waiting", "in_progress", "finished"],
      plan_duration_type: ["weekly", "monthly", "yearly"],
    },
  },
} as const
