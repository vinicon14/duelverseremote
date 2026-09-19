CREATE TABLE public.party_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  language_code text NOT NULL DEFAULT 'pt-BR',
  tcg_type text,
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_private boolean NOT NULL DEFAULT false,
  password text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.party_rooms TO authenticated;
GRANT ALL ON public.party_rooms TO service_role;
ALTER TABLE public.party_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "party_rooms_select_active" ON public.party_rooms
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "party_rooms_insert_own" ON public.party_rooms
  FOR INSERT TO authenticated WITH CHECK (host_id = auth.uid());
CREATE POLICY "party_rooms_update_host_or_admin" ON public.party_rooms
  FOR UPDATE TO authenticated
  USING (host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "party_rooms_delete_host_or_admin" ON public.party_rooms
  FOR DELETE TO authenticated
  USING (host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.party_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.party_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  camera_on boolean NOT NULL DEFAULT false,
  mic_on boolean NOT NULL DEFAULT false,
  force_muted boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE (room_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.party_participants TO authenticated;
GRANT ALL ON public.party_participants TO service_role;
ALTER TABLE public.party_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "party_participants_select_all" ON public.party_participants
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "party_participants_insert_own" ON public.party_participants
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "party_participants_update_self_or_host" ON public.party_participants
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.party_rooms r WHERE r.id = room_id AND r.host_id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.party_rooms r WHERE r.id = room_id AND r.host_id = auth.uid())
  );
CREATE POLICY "party_participants_delete_self_or_host" ON public.party_participants
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.party_rooms r WHERE r.id = room_id AND r.host_id = auth.uid())
  );

CREATE INDEX idx_party_participants_room ON public.party_participants(room_id);
CREATE INDEX idx_party_rooms_active ON public.party_rooms(is_active, created_at DESC);

ALTER TABLE public.match_recordings
  ADD COLUMN IF NOT EXISTS source_platform text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS external_video_id text;

ALTER PUBLICATION supabase_realtime ADD TABLE public.party_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.party_participants;