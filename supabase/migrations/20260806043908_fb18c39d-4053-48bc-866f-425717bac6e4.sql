ALTER TABLE public.marketplace_purchases
  ADD COLUMN IF NOT EXISTS tracking_code text,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS status_history jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.marketplace_purchase_track_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status_history := jsonb_build_array(
      jsonb_build_object('status', NEW.status, 'at', now(), 'by', auth.uid())
    );
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_history := COALESCE(OLD.status_history, '[]'::jsonb) ||
      jsonb_build_object('status', NEW.status, 'at', now(), 'by', auth.uid());
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_purchase_track_status ON public.marketplace_purchases;
CREATE TRIGGER trg_marketplace_purchase_track_status
BEFORE INSERT OR UPDATE ON public.marketplace_purchases
FOR EACH ROW EXECUTE FUNCTION public.marketplace_purchase_track_status();

DROP POLICY IF EXISTS "Admins can view all marketplace purchases" ON public.marketplace_purchases;
CREATE POLICY "Admins can view all marketplace purchases"
ON public.marketplace_purchases FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update marketplace purchases" ON public.marketplace_purchases;
CREATE POLICY "Admins can update marketplace purchases"
ON public.marketplace_purchases FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.marketplace_purchases REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'marketplace_purchases'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_purchases;
  END IF;
END
$$;