ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS country_code text;

UPDATE public.tournaments t
SET country_code = p.country_code
FROM public.profiles p
WHERE p.user_id = t.created_by AND t.country_code IS NULL;

CREATE OR REPLACE FUNCTION public.set_tournament_country()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.country_code IS NULL AND NEW.created_by IS NOT NULL THEN
    SELECT country_code INTO NEW.country_code FROM public.profiles WHERE user_id = NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_tournament_country ON public.tournaments;
CREATE TRIGGER trg_set_tournament_country
BEFORE INSERT ON public.tournaments
FOR EACH ROW EXECUTE FUNCTION public.set_tournament_country();