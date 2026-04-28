
-- Tabela de pacotes de DuelCoins para compra via CartPanda
CREATE TABLE public.duelcoins_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  duelcoins_amount INTEGER NOT NULL,
  price_brl NUMERIC(10,2) NOT NULL,
  checkout_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de pedidos de compra de DuelCoins
CREATE TABLE public.duelcoins_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.duelcoins_packages(id),
  amount_brl NUMERIC(10,2) NOT NULL,
  duelcoins_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT DEFAULT 'pix',
  external_order_id TEXT,
  external_payment_id TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS para duelcoins_packages (leitura pública)
ALTER TABLE public.duelcoins_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active packages" ON public.duelcoins_packages FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage packages" ON public.duelcoins_packages FOR ALL USING (public.is_admin(auth.uid()));

-- RLS para duelcoins_orders
ALTER TABLE public.duelcoins_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own orders" ON public.duelcoins_orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own orders" ON public.duelcoins_orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage all orders" ON public.duelcoins_orders FOR ALL USING (public.is_admin(auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_duelcoins_packages_updated_at BEFORE UPDATE ON public.duelcoins_packages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_duelcoins_orders_updated_at BEFORE UPDATE ON public.duelcoins_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Adicionar 'purchase' ao constraint de transaction_type se necessário
-- (já existe na lista de tipos permitidos conforme memory)
