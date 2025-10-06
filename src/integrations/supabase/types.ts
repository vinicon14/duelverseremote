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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      advertisements: {
        Row: {
          active: boolean
          content: string
          created_at: string | null
          expires_at: string | null
          id: string
          image_url: string | null
          link_url: string | null
          position: string
          title: string
        }
        Insert: {
          active?: boolean
          content: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          position?: string
          title: string
        }
        Update: {
          active?: boolean
          content?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          position?: string
          title?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          created_at: string | null
          game_session_id: string | null
          id: string
          message: string
          receiver_id: string | null
          sender_id: string | null
        }
        Insert: {
          created_at?: string | null
          game_session_id?: string | null
          id?: string
          message: string
          receiver_id?: string | null
          sender_id?: string | null
        }
        Update: {
          created_at?: string | null
          game_session_id?: string | null
          id?: string
          message?: string
          receiver_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_game_session_id_fkey"
            columns: ["game_session_id"]
            isOneToOne: false
            referencedRelation: "live_duels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_requests: {
        Row: {
          addressee_id: string
          created_at: string | null
          id: string
          requester_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          addressee_id: string
          created_at?: string | null
          id?: string
          requester_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          addressee_id?: string
          created_at?: string | null
          id?: string
          requester_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "friend_requests_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "friend_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      friendships: {
        Row: {
          accepted: boolean | null
          addressee_id: string | null
          created_at: string | null
          id: string
          requester_id: string | null
        }
        Insert: {
          accepted?: boolean | null
          addressee_id?: string | null
          created_at?: string | null
          id?: string
          requester_id?: string | null
        }
        Update: {
          accepted?: boolean | null
          addressee_id?: string | null
          created_at?: string | null
          id?: string
          requester_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      game_history: {
        Row: {
          coins_earned: number | null
          created_at: string | null
          elo_after: number | null
          elo_before: number | null
          elo_change: number | null
          experience_gained: number | null
          game_session_id: string | null
          id: string
          player_id: string | null
          result: Database["public"]["Enums"]["match_result"] | null
        }
        Insert: {
          coins_earned?: number | null
          created_at?: string | null
          elo_after?: number | null
          elo_before?: number | null
          elo_change?: number | null
          experience_gained?: number | null
          game_session_id?: string | null
          id?: string
          player_id?: string | null
          result?: Database["public"]["Enums"]["match_result"] | null
        }
        Update: {
          coins_earned?: number | null
          created_at?: string | null
          elo_after?: number | null
          elo_before?: number | null
          elo_change?: number | null
          experience_gained?: number | null
          game_session_id?: string | null
          id?: string
          player_id?: string | null
          result?: Database["public"]["Enums"]["match_result"] | null
        }
        Relationships: [
          {
            foreignKeyName: "game_history_game_session_id_fkey"
            columns: ["game_session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      game_sessions: {
        Row: {
          created_at: string | null
          ended_at: string | null
          game_data: Json | null
          id: string
          player1_id: string | null
          player1_score: number | null
          player2_id: string | null
          player2_score: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["game_status"] | null
          winner_id: string | null
        }
        Insert: {
          created_at?: string | null
          ended_at?: string | null
          game_data?: Json | null
          id?: string
          player1_id?: string | null
          player1_score?: number | null
          player2_id?: string | null
          player2_score?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_status"] | null
          winner_id?: string | null
        }
        Update: {
          created_at?: string | null
          ended_at?: string | null
          game_data?: Json | null
          id?: string
          player1_id?: string | null
          player1_score?: number | null
          player2_id?: string | null
          player2_score?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_status"] | null
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      heroes: {
        Row: {
          attack: number
          avatar_data: string | null
          created_at: string
          durability: number
          experience: number
          health: number
          id: string
          level: number
          luck: number
          max_health: number
          name: string
          precision: number
          resistance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          attack?: number
          avatar_data?: string | null
          created_at?: string
          durability?: number
          experience?: number
          health?: number
          id?: string
          level?: number
          luck?: number
          max_health?: number
          name: string
          precision?: number
          resistance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          attack?: number
          avatar_data?: string | null
          created_at?: string
          durability?: number
          experience?: number
          health?: number
          id?: string
          level?: number
          luck?: number
          max_health?: number
          name?: string
          precision?: number
          resistance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          attack_bonus: number | null
          created_at: string
          defense_bonus: number | null
          durability_value: number | null
          hero_id: string
          id: string
          is_consumable: boolean | null
          is_equipped: boolean | null
          item_name: string
          item_type: string
          precision_bonus: number | null
          rarity: string
          resistance_bonus: number | null
          special_power: string | null
        }
        Insert: {
          attack_bonus?: number | null
          created_at?: string
          defense_bonus?: number | null
          durability_value?: number | null
          hero_id: string
          id?: string
          is_consumable?: boolean | null
          is_equipped?: boolean | null
          item_name: string
          item_type: string
          precision_bonus?: number | null
          rarity?: string
          resistance_bonus?: number | null
          special_power?: string | null
        }
        Update: {
          attack_bonus?: number | null
          created_at?: string
          defense_bonus?: number | null
          durability_value?: number | null
          hero_id?: string
          id?: string
          is_consumable?: boolean | null
          is_equipped?: boolean | null
          item_name?: string
          item_type?: string
          precision_bonus?: number | null
          rarity?: string
          resistance_bonus?: number | null
          special_power?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_hero_id_fkey"
            columns: ["hero_id"]
            isOneToOne: false
            referencedRelation: "heroes"
            referencedColumns: ["id"]
          },
        ]
      }
      live_duels: {
        Row: {
          created_at: string | null
          ended_at: string | null
          id: string
          player1_id: string
          player1_lp: number | null
          player2_id: string | null
          player2_lp: number | null
          room_name: string
          started_at: string | null
          status: string | null
          winner_id: string | null
        }
        Insert: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          player1_id: string
          player1_lp?: number | null
          player2_id?: string | null
          player2_lp?: number | null
          room_name: string
          started_at?: string | null
          status?: string | null
          winner_id?: string | null
        }
        Update: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          player1_id?: string
          player1_lp?: number | null
          player2_id?: string | null
          player2_lp?: number | null
          room_name?: string
          started_at?: string | null
          status?: string | null
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_duels_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "live_duels_player2_id_fkey"
            columns: ["player2_id"]
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
          created_at: string | null
          duel_id: string
          duration_minutes: number | null
          id: string
          player1_elo_after: number
          player1_elo_before: number
          player1_id: string
          player2_elo_after: number
          player2_elo_before: number
          player2_id: string
          winner_id: string | null
        }
        Insert: {
          created_at?: string | null
          duel_id: string
          duration_minutes?: number | null
          id?: string
          player1_elo_after: number
          player1_elo_before: number
          player1_id: string
          player2_elo_after: number
          player2_elo_before: number
          player2_id: string
          winner_id?: string | null
        }
        Update: {
          created_at?: string | null
          duel_id?: string
          duration_minutes?: number | null
          id?: string
          player1_elo_after?: number
          player1_elo_before?: number
          player1_id?: string
          player2_elo_after?: number
          player2_elo_before?: number
          player2_id?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_history_duel_id_fkey"
            columns: ["duel_id"]
            isOneToOne: false
            referencedRelation: "live_duels"
            referencedColumns: ["id"]
          },
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
      matchmaking_queues: {
        Row: {
          created_at: string | null
          elo_rating: number
          estimated_wait_time: number | null
          id: string
          player_id: string | null
          queue_status: Database["public"]["Enums"]["queue_status"] | null
          queue_time: string | null
        }
        Insert: {
          created_at?: string | null
          elo_rating: number
          estimated_wait_time?: number | null
          id?: string
          player_id?: string | null
          queue_status?: Database["public"]["Enums"]["queue_status"] | null
          queue_time?: string | null
        }
        Update: {
          created_at?: string | null
          elo_rating?: number
          estimated_wait_time?: number | null
          id?: string
          player_id?: string | null
          queue_status?: Database["public"]["Enums"]["queue_status"] | null
          queue_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matchmaking_queues_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      multiplayer_chat: {
        Row: {
          created_at: string
          hero_id: string
          id: string
          message: string
          room_id: string
        }
        Insert: {
          created_at?: string
          hero_id: string
          id?: string
          message: string
          room_id: string
        }
        Update: {
          created_at?: string
          hero_id?: string
          id?: string
          message?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "multiplayer_chat_hero_id_fkey"
            columns: ["hero_id"]
            isOneToOne: false
            referencedRelation: "heroes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multiplayer_chat_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "multiplayer_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      multiplayer_rooms: {
        Row: {
          created_at: string
          host_id: string
          id: string
          max_players: number
          room_code: string
          status: string
          story_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          host_id: string
          id?: string
          max_players?: number
          room_code: string
          status?: string
          story_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          host_id?: string
          id?: string
          max_players?: number
          room_code?: string
          status?: string
          story_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "multiplayer_rooms_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      multiplayer_sessions: {
        Row: {
          hero_id: string
          id: string
          is_current_turn: boolean | null
          joined_at: string
          story_id: string
        }
        Insert: {
          hero_id: string
          id?: string
          is_current_turn?: boolean | null
          joined_at?: string
          story_id: string
        }
        Update: {
          hero_id?: string
          id?: string
          is_current_turn?: boolean | null
          joined_at?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "multiplayer_sessions_hero_id_fkey"
            columns: ["hero_id"]
            isOneToOne: false
            referencedRelation: "heroes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multiplayer_sessions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      news: {
        Row: {
          author_id: string
          content: string
          created_at: string | null
          id: string
          image_url: string | null
          published: boolean
          summary: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          published?: boolean
          summary?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          published?: boolean
          summary?: string | null
          title?: string
          updated_at?: string | null
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
          avatar_url: string | null
          best_win_streak: number | null
          coins: number | null
          created_at: string | null
          display_name: string | null
          draws: number | null
          elo_rating: number | null
          experience_points: number | null
          id: string
          is_online: boolean | null
          last_seen: string | null
          level: number | null
          losses: number | null
          total_games: number | null
          updated_at: string | null
          username: string
          win_streak: number | null
          wins: number | null
        }
        Insert: {
          avatar_url?: string | null
          best_win_streak?: number | null
          coins?: number | null
          created_at?: string | null
          display_name?: string | null
          draws?: number | null
          elo_rating?: number | null
          experience_points?: number | null
          id: string
          is_online?: boolean | null
          last_seen?: string | null
          level?: number | null
          losses?: number | null
          total_games?: number | null
          updated_at?: string | null
          username: string
          win_streak?: number | null
          wins?: number | null
        }
        Update: {
          avatar_url?: string | null
          best_win_streak?: number | null
          coins?: number | null
          created_at?: string | null
          display_name?: string | null
          draws?: number | null
          elo_rating?: number | null
          experience_points?: number | null
          id?: string
          is_online?: boolean | null
          last_seen?: string | null
          level?: number | null
          losses?: number | null
          total_games?: number | null
          updated_at?: string | null
          username?: string
          win_streak?: number | null
          wins?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          avatar_url: string | null
          best_win_streak: number | null
          bio: string | null
          coins: number | null
          country: string | null
          created_at: string | null
          display_name: string | null
          draws: number | null
          elo_rating: number | null
          experience_points: number | null
          id: string
          is_banned: boolean
          is_online: boolean | null
          last_seen: string | null
          level: number | null
          losses: number | null
          total_games: number | null
          updated_at: string | null
          user_id: string
          username: string
          win_streak: number | null
          wins: number | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          best_win_streak?: number | null
          bio?: string | null
          coins?: number | null
          country?: string | null
          created_at?: string | null
          display_name?: string | null
          draws?: number | null
          elo_rating?: number | null
          experience_points?: number | null
          id?: string
          is_banned?: boolean
          is_online?: boolean | null
          last_seen?: string | null
          level?: number | null
          losses?: number | null
          total_games?: number | null
          updated_at?: string | null
          user_id: string
          username: string
          win_streak?: number | null
          wins?: number | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          best_win_streak?: number | null
          bio?: string | null
          coins?: number | null
          country?: string | null
          created_at?: string | null
          display_name?: string | null
          draws?: number | null
          elo_rating?: number | null
          experience_points?: number | null
          id?: string
          is_banned?: boolean
          is_online?: boolean | null
          last_seen?: string | null
          level?: number | null
          losses?: number | null
          total_games?: number | null
          updated_at?: string | null
          user_id?: string
          username?: string
          win_streak?: number | null
          wins?: number | null
        }
        Relationships: []
      }
      stories: {
        Row: {
          created_at: string
          current_context: Json | null
          current_turn: number
          hero_id: string
          id: string
          status: string
          story_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_context?: Json | null
          current_turn?: number
          hero_id: string
          id?: string
          status?: string
          story_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_context?: Json | null
          current_turn?: number
          hero_id?: string
          id?: string
          status?: string
          story_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_hero_id_fkey"
            columns: ["hero_id"]
            isOneToOne: false
            referencedRelation: "heroes"
            referencedColumns: ["id"]
          },
        ]
      }
      story_turns: {
        Row: {
          action_description: string
          action_type: string
          ai_response: string
          created_at: string
          hero_state: Json | null
          id: string
          story_id: string
          turn_number: number
          world_state: Json | null
        }
        Insert: {
          action_description: string
          action_type: string
          ai_response: string
          created_at?: string
          hero_state?: Json | null
          id?: string
          story_id: string
          turn_number: number
          world_state?: Json | null
        }
        Update: {
          action_description?: string
          action_type?: string
          ai_response?: string
          created_at?: string
          hero_state?: Json | null
          id?: string
          story_id?: string
          turn_number?: number
          world_state?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "story_turns_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      tournament_matches: {
        Row: {
          completed_at: string | null
          created_at: string | null
          duel_id: string | null
          id: string
          match_number: number
          player1_id: string | null
          player2_id: string | null
          round: number
          started_at: string | null
          status: string
          tournament_id: string
          winner_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          duel_id?: string | null
          id?: string
          match_number: number
          player1_id?: string | null
          player2_id?: string | null
          round: number
          started_at?: string | null
          status?: string
          tournament_id: string
          winner_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          duel_id?: string | null
          id?: string
          match_number?: number
          player1_id?: string | null
          player2_id?: string | null
          round?: number
          started_at?: string | null
          status?: string
          tournament_id?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_matches_duel_id_fkey"
            columns: ["duel_id"]
            isOneToOne: false
            referencedRelation: "live_duels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tournament_matches_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      tournament_participants: {
        Row: {
          eliminated_at: string | null
          id: string
          joined_at: string | null
          placement: number | null
          player_id: string | null
          tournament_id: string | null
        }
        Insert: {
          eliminated_at?: string | null
          id?: string
          joined_at?: string | null
          placement?: number | null
          player_id?: string | null
          tournament_id?: string | null
        }
        Update: {
          eliminated_at?: string | null
          id?: string
          joined_at?: string | null
          placement?: number | null
          player_id?: string | null
          tournament_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_participants_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_participants_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          end_time: string | null
          entry_fee: number | null
          id: string
          max_participants: number | null
          name: string
          prize_pool: number | null
          start_time: string | null
          status: Database["public"]["Enums"]["tournament_status"] | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          entry_fee?: number | null
          id?: string
          max_participants?: number | null
          name: string
          prize_pool?: number | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["tournament_status"] | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          entry_fee?: number | null
          id?: string
          max_participants?: number | null
          name?: string
          prize_pool?: number | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["tournament_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
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
      calculate_elo_change: {
        Args: { k_factor?: number; loser_elo: number; winner_elo: number }
        Returns: number
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
    }
    Enums: {
      account_type: "free" | "pro"
      app_role: "admin" | "user"
      game_status: "waiting" | "in_progress" | "completed" | "cancelled"
      match_result: "win" | "loss" | "draw"
      queue_status: "searching" | "matched" | "in_game"
      tournament_status: "upcoming" | "active" | "completed" | "cancelled"
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
      game_status: ["waiting", "in_progress", "completed", "cancelled"],
      match_result: ["win", "loss", "draw"],
      queue_status: ["searching", "matched", "in_game"],
      tournament_status: ["upcoming", "active", "completed", "cancelled"],
    },
  },
} as const
