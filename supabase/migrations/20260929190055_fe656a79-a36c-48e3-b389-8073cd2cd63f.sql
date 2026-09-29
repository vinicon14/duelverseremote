DO $do$ DECLARE d text; BEGIN
  SELECT pg_get_functiondef('public.lobby_tick(uuid)'::regprocedure) INTO d;
  EXECUTE replace(d, 'CASE WHEN t.tcg_type ILIKE ''m%'' THEN 40 ELSE 8000 END', '8000');
END $do$;