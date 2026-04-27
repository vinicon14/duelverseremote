-- Tabela de custos de cartas no formato Genesis (mantém a chave interna 'magic')
CREATE TABLE IF NOT EXISTS public.genesis_card_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id text NOT NULL,
  card_name text,
  points integer NOT NULL CHECK (points >= 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (card_id)
);

ALTER TABLE public.genesis_card_costs ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode consultar os custos (para validar o deck client-side)
CREATE POLICY "Anyone authenticated can view genesis costs"
  ON public.genesis_card_costs
  FOR SELECT
  TO authenticated
  USING (true);

-- Apenas administradores podem inserir/atualizar/remover
CREATE POLICY "Admins manage genesis costs"
  ON public.genesis_card_costs
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Trigger para manter updated_at
CREATE TRIGGER update_genesis_card_costs_updated_at
  BEFORE UPDATE ON public.genesis_card_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_genesis_card_costs_card_id
  ON public.genesis_card_costs (card_id);