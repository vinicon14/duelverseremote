-- 1. Restrict sensitive system_settings keys to admins only
DROP POLICY IF EXISTS "Anyone can view settings" ON public.system_settings;
DROP POLICY IF EXISTS "Public settings viewable by all" ON public.system_settings;
DROP POLICY IF EXISTS "Admins view all settings" ON public.system_settings;

CREATE POLICY "Public settings viewable by all"
ON public.system_settings
FOR SELECT
USING (key NOT IN ('pix_key', 'support_email', 'store_url'));

CREATE POLICY "Admins view sensitive settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- 2. Prevent users from modifying privileged/financial fields on their own profile
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow admins and service_role to change anything
  IF is_admin(auth.uid()) OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block changes to sensitive/financial/administrative fields by regular users
  IF NEW.duelcoins_balance IS DISTINCT FROM OLD.duelcoins_balance
     OR NEW.account_type    IS DISTINCT FROM OLD.account_type
     OR NEW.is_banned       IS DISTINCT FROM OLD.is_banned
     OR NEW.points          IS DISTINCT FROM OLD.points
     OR NEW.wins            IS DISTINCT FROM OLD.wins
     OR NEW.losses          IS DISTINCT FROM OLD.losses
     OR NEW.level           IS DISTINCT FROM OLD.level
     OR NEW.user_id         IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation_trg ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();