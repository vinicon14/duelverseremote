DO $do$ DECLARE d text; BEGIN
  SELECT pg_get_functiondef('public.lobby_tick(uuid)'::regprocedure) INTO d;
  EXECUTE replace(d, ', status=''in_progress'' WHERE id=m.id', ' WHERE id=m.id');
END $do$;
REVOKE EXECUTE ON FUNCTION public.lobby_can_access(uuid, uuid) FROM authenticated;