
-- Mapeamento canal de voz Discord → DuelRoom
CREATE TABLE public.discord_voice_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  guild_name text,
  channel_id text NOT NULL UNIQUE,
  channel_name text,
  duel_id uuid REFERENCES public.live_duels(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX idx_dvr_duel_id ON public.discord_voice_rooms(duel_id);
CREATE INDEX idx_dvr_active ON public.discord_voice_rooms(is_active);

ALTER TABLE public.discord_voice_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view voice rooms"
  ON public.discord_voice_rooms FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role manages voice rooms"
  ON public.discord_voice_rooms FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins manage voice rooms"
  ON public.discord_voice_rooms FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Roster: quem está conectado em cada canal de voz
CREATE TABLE public.discord_voice_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_room_id uuid NOT NULL REFERENCES public.discord_voice_rooms(id) ON DELETE CASCADE,
  discord_user_id text NOT NULL,
  discord_username text NOT NULL,
  discord_avatar_url text,
  duelverse_user_id uuid,
  duelverse_username text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE (voice_room_id, discord_user_id, joined_at)
);

CREATE INDEX idx_dvp_room ON public.discord_voice_participants(voice_room_id) WHERE left_at IS NULL;
CREATE INDEX idx_dvp_discord_user ON public.discord_voice_participants(discord_user_id);

ALTER TABLE public.discord_voice_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view participants"
  ON public.discord_voice_participants FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role manages participants"
  ON public.discord_voice_participants FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins manage participants"
  ON public.discord_voice_participants FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.discord_voice_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.discord_voice_participants;

-- updated_at trigger
CREATE TRIGGER trg_dvr_updated_at
  BEFORE UPDATE ON public.discord_voice_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
