CREATE OR REPLACE FUNCTION public.delete_party_room(_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.party_rooms r
    WHERE r.id = _room_id
      AND (r.host_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ) THEN
    RAISE EXCEPTION 'Not allowed to delete this party room';
  END IF;

  DELETE FROM public.party_participants WHERE room_id = _room_id;
  DELETE FROM public.party_rooms WHERE id = _room_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_party_room(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_empty_party_rooms()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer := 0;
  stale_ids uuid[];
BEGIN
  SELECT array_agg(r.id) INTO stale_ids
  FROM public.party_rooms r
  WHERE NOT EXISTS (
          SELECT 1 FROM public.party_participants p
          WHERE p.room_id = r.id AND p.left_at IS NULL
        )
    AND GREATEST(
          r.created_at,
          COALESCE((SELECT max(pp.left_at) FROM public.party_participants pp WHERE pp.room_id = r.id), r.created_at)
        ) < now() - interval '3 minutes';

  IF stale_ids IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.party_participants WHERE room_id = ANY(stale_ids);
  DELETE FROM public.party_rooms WHERE id = ANY(stale_ids);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_empty_party_rooms() TO authenticated, service_role;