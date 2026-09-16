
REVOKE ALL ON FUNCTION public.bp_register_event(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bp_bump_missions(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bp_on_match_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bp_on_tournament_match() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bp_level_for_wins(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bp_current_season_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bp_claim_reward(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bp_claim_mission(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bp_purchase_pro(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bp_admin_set_progress(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bp_get_overview(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bp_claim_reward(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bp_claim_mission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bp_purchase_pro(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bp_admin_set_progress(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bp_current_season_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bp_level_for_wins(uuid, integer) TO authenticated;
