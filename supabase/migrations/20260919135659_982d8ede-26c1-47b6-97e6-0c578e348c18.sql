
CREATE OR REPLACE FUNCTION public.admin_party_rooms(p_include_closed boolean DEFAULT false)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  language_code text,
  tcg_type text,
  host_id uuid,
  host_username text,
  is_private boolean,
  is_active boolean,
  created_at timestamptz,
  closed_at timestamptz,
  participants bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id,
    r.name,
    r.description,
    r.language_code,
    r.tcg_type,
    r.host_id,
    p.username,
    r.is_private,
    r.is_active,
    r.created_at,
    r.closed_at,
    (SELECT count(*) FROM public.party_participants pp
      WHERE pp.room_id = r.id AND pp.left_at IS NULL)
  FROM public.party_rooms r
  LEFT JOIN public.profiles p ON p.user_id = r.host_id
  WHERE public.has_role(auth.uid(), 'admin')
    AND (p_include_closed OR r.is_active)
  ORDER BY r.is_active DESC, r.created_at DESC
  LIMIT 300;
$$;

REVOKE ALL ON FUNCTION public.admin_party_rooms(boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_party_rooms(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_country_metrics(p_from timestamptz DEFAULT now() - interval '30 days', p_to timestamptz DEFAULT now())
RETURNS TABLE (
  country_code text,
  total bigint,
  online bigint,
  new_in_period bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(pr.country_code, 'ZZ') AS country_code,
    count(*) AS total,
    count(*) FILTER (WHERE pr.is_online) AS online,
    count(*) FILTER (WHERE pr.created_at >= p_from AND pr.created_at <= p_to) AS new_in_period
  FROM public.profiles pr
  WHERE public.has_role(auth.uid(), 'admin')
  GROUP BY COALESCE(pr.country_code, 'ZZ')
  ORDER BY count(*) DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_country_metrics(timestamptz, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_country_metrics(timestamptz, timestamptz) TO authenticated;
