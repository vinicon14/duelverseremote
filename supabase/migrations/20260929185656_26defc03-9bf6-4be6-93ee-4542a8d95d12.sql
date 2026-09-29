ALTER TABLE public.tournament_matches ADD COLUMN IF NOT EXISTS table_number integer, ADD COLUMN IF NOT EXISTS duel_id uuid;

CREATE TABLE public.tournament_lobby_state (
  tournament_id uuid PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round integer NOT NULL DEFAULT 1,
  countdown_ends_at timestamptz,
  is_paused boolean NOT NULL DEFAULT false,
  paused_remaining integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tournament_lobby_state TO service_role;
ALTER TABLE public.tournament_lobby_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tournament_lobby_presence (
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id)
);
GRANT ALL ON public.tournament_lobby_presence TO service_role;
ALTER TABLE public.tournament_lobby_presence ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.lobby_can_access(p_t uuid, p_u uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM tournaments WHERE id=p_t AND created_by=p_u)
      OR EXISTS(SELECT 1 FROM tournament_participants WHERE tournament_id=p_t AND user_id=p_u)
      OR public.is_admin(p_u)
$$;

CREATE OR REPLACE FUNCTION public.lobby_tick(p_tournament_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  t record; s record; m record;
  v_round int; v_is_org boolean;
  v_required uuid[]; v_present uuid[];
  v_all boolean; v_table int; v_duel uuid; v_lp int;
  v_pending int; v_total int; v_gen json; v_finished boolean := false;
BEGIN
  IF v_uid IS NULL OR NOT lobby_can_access(p_tournament_id, v_uid) THEN
    RETURN json_build_object('success', false, 'message', 'Sem acesso a este lobby');
  END IF;
  SELECT * INTO t FROM tournaments WHERE id=p_tournament_id;
  v_is_org := t.created_by = v_uid OR is_admin(v_uid);
  v_round := COALESCE(t.current_round, 1);

  INSERT INTO tournament_lobby_presence(tournament_id,user_id,last_seen) VALUES (p_tournament_id,v_uid,now())
  ON CONFLICT (tournament_id,user_id) DO UPDATE SET last_seen=now();
  INSERT INTO tournament_lobby_state(tournament_id, round) VALUES (p_tournament_id, v_round) ON CONFLICT DO NOTHING;
  SELECT * INTO s FROM tournament_lobby_state WHERE tournament_id=p_tournament_id FOR UPDATE;

  IF s.round <> v_round THEN
    UPDATE tournament_lobby_state SET round=v_round, countdown_ends_at=NULL, is_paused=false, paused_remaining=NULL, updated_at=now() WHERE tournament_id=p_tournament_id;
    SELECT * INTO s FROM tournament_lobby_state WHERE tournament_id=p_tournament_id;
  END IF;

  IF t.status = 'active' THEN
    -- BYE: partidas com um único jogador avançam sem mesa
    UPDATE tournament_matches SET status='completed', winner_id=COALESCE(player1_id, player2_id)
     WHERE tournament_id=p_tournament_id AND round=v_round AND status<>'completed'
       AND (player1_id IS NULL) <> (player2_id IS NULL);

    SELECT COUNT(*) FILTER (WHERE status<>'completed'), COUNT(*) INTO v_pending, v_total
      FROM tournament_matches WHERE tournament_id=p_tournament_id AND round=v_round;

    -- Rodada concluída: organizador gera a próxima automaticamente
    IF v_total > 0 AND v_pending = 0 AND v_is_org THEN
      BEGIN
        v_gen := generate_next_round(p_tournament_id);
        IF (v_gen->>'success')::boolean IS NOT TRUE THEN v_finished := true; END IF;
      EXCEPTION WHEN OTHERS THEN v_finished := true; END;
      SELECT * INTO t FROM tournaments WHERE id=p_tournament_id;
      v_round := COALESCE(t.current_round, 1);
      UPDATE tournament_lobby_state SET round=v_round, countdown_ends_at=NULL, is_paused=false, paused_remaining=NULL, updated_at=now() WHERE tournament_id=p_tournament_id;
      SELECT * INTO s FROM tournament_lobby_state WHERE tournament_id=p_tournament_id;
    END IF;

    -- Jogadores necessários: das partidas ainda sem mesa
    SELECT array_agg(DISTINCT u) INTO v_required FROM (
      SELECT player1_id u FROM tournament_matches WHERE tournament_id=p_tournament_id AND round=v_round AND status<>'completed' AND duel_id IS NULL AND player1_id IS NOT NULL AND player2_id IS NOT NULL
      UNION SELECT player2_id FROM tournament_matches WHERE tournament_id=p_tournament_id AND round=v_round AND status<>'completed' AND duel_id IS NULL AND player1_id IS NOT NULL AND player2_id IS NOT NULL) x;

    SELECT array_agg(user_id) INTO v_present FROM tournament_lobby_presence
     WHERE tournament_id=p_tournament_id AND last_seen > now() - interval '20 seconds';

    v_all := v_required IS NOT NULL AND v_required <@ COALESCE(v_present, ARRAY[]::uuid[]);

    IF v_all AND s.countdown_ends_at IS NULL AND NOT s.is_paused THEN
      UPDATE tournament_lobby_state SET countdown_ends_at = now() + interval '180 seconds', updated_at=now() WHERE tournament_id=p_tournament_id;
      SELECT * INTO s FROM tournament_lobby_state WHERE tournament_id=p_tournament_id;
    END IF;

    -- Cronômetro zerou: cria as mesas
    IF v_required IS NOT NULL AND NOT s.is_paused AND s.countdown_ends_at IS NOT NULL AND s.countdown_ends_at <= now() THEN
      v_lp := CASE WHEN t.tcg_type ILIKE 'm%' THEN 40 ELSE 8000 END;
      SELECT COALESCE(MAX(table_number),0) INTO v_table FROM tournament_matches WHERE tournament_id=p_tournament_id AND round=v_round;
      FOR m IN SELECT * FROM tournament_matches WHERE tournament_id=p_tournament_id AND round=v_round AND status<>'completed' AND duel_id IS NULL AND player1_id IS NOT NULL AND player2_id IS NOT NULL ORDER BY created_at, id LOOP
        v_table := v_table + 1;
        INSERT INTO live_duels(creator_id, opponent_id, status, is_ranked, tcg_type, player1_lp, player2_lp, room_name)
        VALUES (m.player1_id, m.player2_id, 'waiting', false, COALESCE(t.tcg_type,'yugioh'), v_lp, v_lp, left(t.name,40) || ' • Mesa ' || v_table)
        RETURNING id INTO v_duel;
        UPDATE tournament_matches SET duel_id=v_duel, table_number=v_table, status='in_progress' WHERE id=m.id;
      END LOOP;
      UPDATE tournament_lobby_state SET countdown_ends_at=NULL, updated_at=now() WHERE tournament_id=p_tournament_id;
      SELECT * INTO s FROM tournament_lobby_state WHERE tournament_id=p_tournament_id;
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true, 'is_organizer', v_is_org, 'status', t.status, 'round', v_round,
    'finished', v_finished OR t.status='completed',
    'countdown_ends_at', s.countdown_ends_at, 'is_paused', s.is_paused, 'paused_remaining', s.paused_remaining,
    'server_now', now(),
    'required', COALESCE(to_json(v_required), '[]'::json),
    'present', (SELECT COALESCE(json_agg(json_build_object('user_id',p.user_id,'username',pr.username,'avatar_url',pr.avatar_url)),'[]'::json)
                  FROM tournament_lobby_presence p LEFT JOIN profiles pr ON pr.user_id=p.user_id
                 WHERE p.tournament_id=p_tournament_id AND p.last_seen > now() - interval '20 seconds'),
    'my_status', (SELECT status FROM tournament_participants WHERE tournament_id=p_tournament_id AND user_id=v_uid),
    'matches', (SELECT COALESCE(json_agg(json_build_object('id',tm.id,'table_number',tm.table_number,'duel_id',tm.duel_id,'status',tm.status,
                  'player1_id',tm.player1_id,'player2_id',tm.player2_id,'winner_id',tm.winner_id,
                  'p1',(SELECT username FROM profiles WHERE user_id=tm.player1_id),'p2',(SELECT username FROM profiles WHERE user_id=tm.player2_id)) ORDER BY tm.table_number NULLS LAST),'[]'::json)
                  FROM tournament_matches tm WHERE tm.tournament_id=p_tournament_id AND tm.round=v_round)
  );
END $$;

CREATE OR REPLACE FUNCTION public.lobby_set_paused(p_tournament_id uuid, p_paused boolean)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM tournaments WHERE id=p_tournament_id AND (created_by=auth.uid() OR is_admin(auth.uid()))) THEN
    RETURN json_build_object('success', false, 'message', 'Apenas o organizador');
  END IF;
  SELECT * INTO s FROM tournament_lobby_state WHERE tournament_id=p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'message', 'Lobby não iniciado'); END IF;
  IF p_paused AND NOT s.is_paused THEN
    UPDATE tournament_lobby_state SET is_paused=true,
      paused_remaining = CASE WHEN countdown_ends_at IS NULL THEN NULL ELSE GREATEST(0, EXTRACT(EPOCH FROM countdown_ends_at-now())::int) END,
      countdown_ends_at=NULL, updated_at=now() WHERE tournament_id=p_tournament_id;
  ELSIF NOT p_paused AND s.is_paused THEN
    UPDATE tournament_lobby_state SET is_paused=false,
      countdown_ends_at = CASE WHEN paused_remaining IS NULL THEN NULL ELSE now() + make_interval(secs => paused_remaining) END,
      paused_remaining=NULL, updated_at=now() WHERE tournament_id=p_tournament_id;
  END IF;
  RETURN json_build_object('success', true);
END $$;

REVOKE ALL ON FUNCTION public.lobby_tick(uuid), public.lobby_set_paused(uuid, boolean), public.lobby_can_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lobby_tick(uuid), public.lobby_set_paused(uuid, boolean) TO authenticated;