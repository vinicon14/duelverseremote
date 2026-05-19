
-- Add verification fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Verification requests table
CREATE TABLE IF NOT EXISTS public.verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  cpf TEXT NOT NULL,
  birth_date DATE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  rejection_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_requests_user ON public.verification_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON public.verification_requests(status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_verification_pending_per_user
  ON public.verification_requests(user_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_verification_cpf_approved
  ON public.verification_requests(cpf) WHERE status = 'approved';

ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

-- Validation trigger (no CHECK to keep flexible)
CREATE OR REPLACE FUNCTION public.validate_verification_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  digits TEXT;
BEGIN
  digits := regexp_replace(COALESCE(NEW.cpf, ''), '\D', '', 'g');
  IF length(digits) <> 11 THEN
    RAISE EXCEPTION 'CPF inválido: deve conter 11 dígitos';
  END IF;
  NEW.cpf := digits;
  IF length(trim(COALESCE(NEW.full_name, ''))) < 3 THEN
    RAISE EXCEPTION 'Nome completo inválido';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_verification_request ON public.verification_requests;
CREATE TRIGGER trg_validate_verification_request
  BEFORE INSERT OR UPDATE ON public.verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_verification_request();

-- RLS policies
DROP POLICY IF EXISTS "Users view own verification requests" ON public.verification_requests;
CREATE POLICY "Users view own verification requests"
  ON public.verification_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users create own verification request" ON public.verification_requests;
CREATE POLICY "Users create own verification request"
  ON public.verification_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Admins manage verification requests" ON public.verification_requests;
CREATE POLICY "Admins manage verification requests"
  ON public.verification_requests FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Admin function to approve/reject (also flips profile flag)
CREATE OR REPLACE FUNCTION public.review_verification_request(
  _request_id UUID,
  _approve BOOLEAN,
  _reason TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req public.verification_requests%ROWTYPE;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas admins podem revisar pedidos';
  END IF;

  SELECT * INTO v_req FROM public.verification_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  IF _approve THEN
    UPDATE public.verification_requests
      SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = NULL
      WHERE id = _request_id;
    UPDATE public.profiles
      SET is_verified = true, verified_at = now()
      WHERE user_id = v_req.user_id;
  ELSE
    UPDATE public.verification_requests
      SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = _reason
      WHERE id = _request_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Admin function to toggle verification directly (from AdminUsers)
CREATE OR REPLACE FUNCTION public.admin_set_user_verified(
  _user_id UUID,
  _verified BOOLEAN
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas admins';
  END IF;
  UPDATE public.profiles
    SET is_verified = _verified,
        verified_at = CASE WHEN _verified THEN now() ELSE NULL END
    WHERE user_id = _user_id;
  RETURN jsonb_build_object('success', true);
END;
$$;
