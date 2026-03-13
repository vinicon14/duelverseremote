import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { DuelCoinsBalance } from "@/components/DuelCoinsBalance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Coins, ShoppingCart, Star, ExternalLink, History, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBanCheck } from "@/hooks/useBanCheck";

interface DuelCoinsPackage {
  id: string;
  name: string;
  description: string | null;
  duelcoins_amount: number;
  price_brl: number;
  checkout_url: string | null;
  is_featured: boolean;
  image_url: string | null;
  sort_order: number;
}

interface DuelCoinsOrder {
  id: string;
  duelcoins_amount: number;
  amount_brl: number;
  status: string;
  created_at: string;
  paid_at: string | null;
}

export default function BuyDuelCoins() {
  useBanCheck();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [packages, setPackages] = useState<DuelCoinsPackage[]>([]);
  const [orders, setOrders] = useState<DuelCoinsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  const checkAuthAndLoad = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setUserId(session.user.id);
    await Promise.all([fetchPackages(), fetchOrders(session.user.id)]);
    setLoading(false);
  };

  const fetchPackages = async () => {
    const { data } = await supabase
      .from('duelcoins_packages')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    setPackages((data as any[]) || []);
  };

  const fetchOrders = async (uid: string) => {
    const { data } = await supabase
      .from('duelcoins_orders')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(20);
    setOrders((data as any[]) || []);
  };

  const handleBuy = async (pkg: DuelCoinsPackage) => {
    if (!pkg.checkout_url) {
      toast({ title: "Link de checkout não configurado", variant: "destructive" });
      return;
    }

    setBuying(pkg.id);
    try {
      // Criar pedido pendente
      const orderId = crypto.randomUUID();
      const { error } = await supabase
        .from('duelcoins_orders')
        .insert({
          id: orderId,
          user_id: userId,
          package_id: pkg.id,
          amount_brl: pkg.price_brl,
          duelcoins_amount: pkg.duelcoins_amount,
          status: 'pending',
          external_order_id: orderId,
        } as any);

      if (error) throw error;

      // Redirecionar para checkout com o ID do pedido
      const checkoutUrl = new URL(pkg.checkout_url);
      checkoutUrl.searchParams.set('ref', orderId);
      checkoutUrl.searchParams.set('email', (await supabase.auth.getUser()).data.user?.email || '');
      
      window.open(checkoutUrl.toString(), '_blank');
      
      toast({
        title: "Redirecionando para pagamento",
        description: "Complete o pagamento na página que abriu. Os DuelCoins serão creditados automaticamente!",
      });

      fetchOrders(userId);
    } catch (error: any) {
      console.error('Error creating order:', error);
      toast({ title: "Erro ao criar pedido", description: error.message, variant: "destructive" });
    } finally {
      setBuying(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge className="bg-green-500">Pago</Badge>;
      case 'pending': return <Badge variant="outline">Pendente</Badge>;
      case 'cancelled': return <Badge variant="destructive">Cancelado</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center pt-32">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold gradient-text flex items-center justify-center gap-2">
              <ShoppingCart className="w-10 h-10 text-primary" />
              Comprar DuelCoins
            </h1>
            <p className="text-muted-foreground">
              Adquira DuelCoins via PIX de forma rápida e segura
            </p>
          </div>

          <DuelCoinsBalance />

          {packages.length === 0 ? (
            <Card className="card-mystic">
              <CardContent className="py-12 text-center">
                <Coins className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">Nenhum pacote disponível</h3>
                <p className="text-muted-foreground">Os pacotes de DuelCoins serão disponibilizados em breve.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {packages.map((pkg) => (
                <Card
                  key={pkg.id}
                  className={`card-mystic relative overflow-hidden transition-all hover:scale-[1.02] ${
                    pkg.is_featured ? 'ring-2 ring-primary' : ''
                  }`}
                >
                  {pkg.is_featured && (
                    <div className="absolute top-2 right-2">
                      <Badge className="bg-primary">
                        <Star className="w-3 h-3 mr-1" /> Popular
                      </Badge>
                    </div>
                  )}
                  {pkg.image_url && (
                    <div className="w-full h-32 overflow-hidden">
                      <img src={pkg.image_url} alt={pkg.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Coins className="w-5 h-5 text-yellow-500" />
                      {pkg.name}
                    </CardTitle>
                    {pkg.description && (
                      <CardDescription>{pkg.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-yellow-500">
                        {pkg.duelcoins_amount.toLocaleString('pt-BR')}
                      </div>
                      <div className="text-sm text-muted-foreground">DuelCoins</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-primary">
                        R$ {Number(pkg.price_brl).toFixed(2).replace('.', ',')}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleBuy(pkg)}
                      disabled={buying === pkg.id || !pkg.checkout_url}
                      className="w-full btn-mystic"
                      size="lg"
                    >
                      {buying === pkg.id ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <ExternalLink className="w-4 h-4 mr-2" />
                      )}
                      {buying === pkg.id ? "Processando..." : "Comprar via PIX"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {orders.length > 0 && (
            <Card className="card-mystic">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Meus Pedidos
                </CardTitle>
                <CardDescription>Histórico de compras de DuelCoins</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>DuelCoins</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="text-xs">
                            {new Date(order.created_at).toLocaleString('pt-BR')}
                          </TableCell>
                          <TableCell className="font-bold text-yellow-500">
                            {order.duelcoins_amount} <Coins className="w-3 h-3 inline" />
                          </TableCell>
                          <TableCell>
                            R$ {Number(order.amount_brl).toFixed(2).replace('.', ',')}
                          </TableCell>
                          <TableCell>{getStatusBadge(order.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
