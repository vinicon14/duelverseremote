
-- Convites de matchmaking via Discord
CREATE TABLE IF NOT EXISTS public.matchmaking_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL,
  match_type text NOT NULL CHECK (match_type IN ('ranked','casual')),
  tcg_type text NOT NULL DEFAULT 'yugioh',
  max_players integer NOT NULL DEFAULT 2,
  language_code text NOT NULL DEFAULT 'en',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','matched','expired','cancelled')),
  duel_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  matched_user_id uuid,
  matched_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_matchmaking_invites_host
  ON public.matchmaking_invites(host_user_id);
CREATE INDEX IF NOT EXISTS idx_matchmaking_invites_status
  ON public.matchmaking_invites(status);

ALTER TABLE public.matchmaking_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view matchmaking invites"
  ON public.matchmaking_invites;
CREATE POLICY "Anyone authenticated can view matchmaking invites"
  ON public.matchmaking_invites FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role manages matchmaking invites"
  ON public.matchmaking_invites;
CREATE POLICY "Service role manages matchmaking invites"
  ON public.matchmaking_invites FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Hosts can cancel own invites"
  ON public.matchmaking_invites;
CREATE POLICY "Hosts can cancel own invites"
  ON public.matchmaking_invites FOR UPDATE
  TO authenticated USING (auth.uid() = host_user_id)
  WITH CHECK (auth.uid() = host_user_id);

-- RPC que aceita um invite e cria o duelo entre o host e quem clicou.
-- Usa SECURITY DEFINER para evitar problemas de permissão.
CREATE OR REPLACE FUNCTION public.accept_matchmaking_invite(
  p_invite_id uuid,
  p_user_id uuid
)
RETURNS TABLE(duel_id uuid, status text, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.matchmaking_invites%ROWTYPE;
  v_duel_id uuid;
BEGIN
  SELECT * INTO v_invite
  FROM public.matchmaking_invites
  WHERE id = p_invite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, 'not_found'::text, 'Invite not found'::text;
    RETURN;
  END IF;

  -- Already matched? Just return the existing duel.
  IF v_invite.status = 'matched' AND v_invite.duel_id IS NOT NULL THEN
    RETURN QUERY SELECT v_invite.duel_id, 'already_matched'::text, 'Already matched'::text;
    RETURN;
  END IF;

  IF v_invite.status <> 'open' THEN
    RETURN QUERY SELECT NULL::uuid, v_invite.status, 'Invite not available'::text;
    RETURN;
  END IF;

  IF v_invite.expires_at < now() THEN
    UPDATE public.matchmaking_invites
       SET status = 'expired'
     WHERE id = p_invite_id;
    RETURN QUERY SELECT NULL::uuid, 'expired'::text, 'Invite expired'::text;
    RETURN;
  END IF;

  IF v_invite.host_user_id = p_user_id THEN
    RETURN QUERY SELECT NULL::uuid, 'self'::text, 'Cannot accept own invite'::text;
    RETURN;
  END IF;

  -- Create the live_duel
  INSERT INTO public.live_duels (
    creator_id, opponent_id, status, tcg_type, room_name,
    is_ranked, max_players
  )
  VALUES (
    v_invite.host_user_id,
    p_user_id,
    'in_progress',
    v_invite.tcg_type,
    'Matchmaking ' || v_invite.match_type,
    v_invite.match_type = 'ranked',
    v_invite.max_players
  )
  RETURNING id INTO v_duel_id;

  -- Mark invite matched
  UPDATE public.matchmaking_invites
     SET status = 'matched',
         duel_id = v_duel_id,
         matched_user_id = p_user_id,
         matched_at = now()
   WHERE id = p_invite_id;

  -- Insert a redirect for the host so polling code can pick it up
  INSERT INTO public.redirects (user_id, duel_id)
  VALUES (v_invite.host_user_id, v_duel_id);

  -- Clear matchmaking queue entries for both users
  DELETE FROM public.matchmaking_queue
   WHERE user_id IN (v_invite.host_user_id, p_user_id);

  RETURN QUERY SELECT v_duel_id, 'matched'::text, 'OK'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_matchmaking_invite(uuid, uuid)
  TO authenticated, service_role;
