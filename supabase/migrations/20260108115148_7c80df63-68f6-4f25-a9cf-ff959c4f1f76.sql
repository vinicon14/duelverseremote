-- Fix search_path for calculate_level_from_points function
CREATE OR REPLACE FUNCTION public.calculate_level_from_points(p_points INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN GREATEST(1, (p_points / 100) + 1);
END;
$$;