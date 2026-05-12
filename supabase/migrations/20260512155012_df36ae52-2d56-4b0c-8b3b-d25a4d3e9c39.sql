-- ============ 1. push_subscriptions: remove from realtime publication ============
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'push_subscriptions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.push_subscriptions';
  END IF;
END$$;

-- ============ 2. match_recordings: tighten UPDATE policies ============
DROP POLICY IF EXISTS "Anyone can increment views on public recordings" ON public.match_recordings;
DROP POLICY IF EXISTS "Users can update their own recordings" ON public.match_recordings;

CREATE POLICY "Owners update own recordings"
ON public.match_recordings
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.increment_recording_views(p_recording_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.match_recordings
  SET views = COALESCE(views, 0) + 1
  WHERE id = p_recording_id AND is_public = true;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_recording_views(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_recording_views(uuid) TO anon, authenticated;

-- ============ 3. live_duels: remove open-join branch + join_duel RPC ============
DROP POLICY IF EXISTS "Participants update duels v3" ON public.live_duels;

CREATE POLICY "Participants update duels"
ON public.live_duels
FOR UPDATE
TO authenticated
USING (
  auth.uid() = creator_id
  OR auth.uid() = opponent_id
  OR auth.uid() = player3_id
  OR auth.uid() = player4_id
)
WITH CHECK (
  auth.uid() = creator_id
  OR auth.uid() = opponent_id
  OR auth.uid() = player3_id
  OR auth.uid() = player4_id
);

CREATE OR REPLACE FUNCTION public.join_duel(p_duel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_duel public.live_duels%ROWTYPE;
  v_slot text := NULL;
  v_filled int;
  v_new_status game_status;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_duel FROM public.live_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duel not found';
  END IF;

  IF v_duel.status = 'finished' THEN
    RAISE EXCEPTION 'Duel finished';
  END IF;

  -- Already in duel?
  IF v_uid IN (v_duel.creator_id, v_duel.opponent_id, v_duel.player3_id, v_duel.player4_id) THEN
    RETURN jsonb_build_object('joined', false, 'already_in', true);
  END IF;

  IF v_duel.opponent_id IS NULL THEN
    v_slot := 'opponent_id';
  ELSIF v_duel.max_players >= 3 AND v_duel.player3_id IS NULL THEN
    v_slot := 'player3_id';
  ELSIF v_duel.max_players >= 4 AND v_duel.player4_id IS NULL THEN
    v_slot := 'player4_id';
  ELSE
    RETURN jsonb_build_object('joined', false, 'full', true);
  END IF;

  v_filled := 1
    + (CASE WHEN v_duel.opponent_id IS NOT NULL OR v_slot = 'opponent_id' THEN 1 ELSE 0 END)
    + (CASE WHEN v_duel.player3_id   IS NOT NULL OR v_slot = 'player3_id'   THEN 1 ELSE 0 END)
    + (CASE WHEN v_duel.player4_id   IS NOT NULL OR v_slot = 'player4_id'   THEN 1 ELSE 0 END);

  v_new_status := v_duel.status;
  IF v_filled >= v_duel.max_players THEN
    v_new_status := 'in_progress';
  END IF;

  EXECUTE format(
    'UPDATE public.live_duels SET %I = $1, status = $2 WHERE id = $3',
    v_slot
  ) USING v_uid, v_new_status, p_duel_id;

  RETURN jsonb_build_object('joined', true, 'slot', v_slot, 'status', v_new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.join_duel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_duel(uuid) TO authenticated;

-- ============ 4. marketplace_products: enforce PRO-only insert ============
DROP POLICY IF EXISTS "PRO users can insert products" ON public.marketplace_products;

CREATE POLICY "PRO users or admins can insert products"
ON public.marketplace_products
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.account_type = 'pro'
  )
);

-- ============ 5. realtime.messages: require authenticated ============
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN others THEN NULL;
  END;

  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "authenticated can use realtime" ON realtime.messages';
  EXCEPTION WHEN others THEN NULL;
  END;

  BEGIN
    EXECUTE $POL$
      CREATE POLICY "authenticated can use realtime"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (true)
    $POL$;
  EXCEPTION WHEN others THEN NULL;
  END;

  BEGIN
    EXECUTE $POL$
      CREATE POLICY "authenticated can broadcast realtime"
      ON realtime.messages
      FOR INSERT
      TO authenticated
      WITH CHECK (true)
    $POL$;
  EXCEPTION WHEN others THEN NULL;
  END;
END$$;