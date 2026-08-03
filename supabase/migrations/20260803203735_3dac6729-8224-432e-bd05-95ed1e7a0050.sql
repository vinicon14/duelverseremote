REVOKE ALL ON FUNCTION public.record_match_result(uuid, uuid, uuid, uuid, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_match_result(uuid, uuid, uuid, uuid, integer, integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_finished_duel_result() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_finished_duel_result() TO service_role;