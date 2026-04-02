
-- Fix search_path using ALTER FUNCTION (avoids DROP/recreate)
ALTER FUNCTION public.is_admin(uuid) SET search_path = public;
ALTER FUNCTION public.is_judge(uuid) SET search_path = public;
