-- Criar tabela de logs de chamadas de juiz
CREATE TABLE IF NOT EXISTS public.judge_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.live_duels(id) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_room', 'resolved')),
  judge_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Habilitar RLS
ALTER TABLE public.judge_logs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para judge_logs
CREATE POLICY "Players can create judge calls"
  ON public.judge_logs
  FOR INSERT
  WITH CHECK (auth.uid() = player_id);

CREATE POLICY "Players view own calls"
  ON public.judge_logs
  FOR SELECT
  USING (auth.uid() = player_id OR auth.uid() = judge_id);

CREATE POLICY "Judges view all pending calls"
  ON public.judge_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'judge'::app_role
    )
  );

CREATE POLICY "Judges update calls"
  ON public.judge_logs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'judge'::app_role
    )
  );

CREATE POLICY "Admins manage all judge logs"
  ON public.judge_logs
  FOR ALL
  USING (is_admin(auth.uid()));

-- Função helper para verificar se é juiz
CREATE OR REPLACE FUNCTION public.is_judge(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'judge'::app_role)
$$;

-- Comentários
COMMENT ON TABLE public.judge_logs IS 'Registro de chamadas de juiz durante os duelos';
COMMENT ON COLUMN public.judge_logs.status IS 'pending: aguardando juiz | in_room: juiz na sala | resolved: resolvido';