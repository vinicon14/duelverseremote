import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { DuelCoinsBalance } from "@/components/DuelCoinsBalance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Coins, ShoppingCart, Star, History, Loader2, CreditCard } from "lucide-react";
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

interface PixData {
  qr_code_image: string;
  br_code: string;
  amount_brl: number;
  duelcoins_amount: number;
}

export default function BuyDuelCoins() {
  useBanCheck();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [packages, setPackages] = useState<DuelCoinsPackage[]>([]);
  const [orders, setOrders] = useState<DuelCoinsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast({ title: "Pagamento realizado!", description: "Seus DuelCoins serão creditados em instantes." });
    } else if (searchParams.get("canceled") === "true") {
      toast({ title: "Pagamento cancelado", variant: "destructive" });
    }
  }, [searchParams]);

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
    setBuying(pkg.id);
    try {
      // Try AbacatePay API first
      const { data, error } = await supabase.functions.invoke('abacatepay-create-pix', {
        body: { package_id: pkg.id },
      });

      if (error) throw error;

      if (data?.success && data?.qr_code_image) {
        // Show QR code dialog
        setPixDialog({
          qr_code_image: data.qr_code_image,
          br_code: data.br_code,
          amount_brl: data.amount_brl,
          duelcoins_amount: data.duelcoins_amount,
        });
        fetchOrders(userId);
      } else if (pkg.checkout_url) {
        // Fallback to checkout URL
        const orderId = crypto.randomUUID();
        await supabase
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

        window.open(pkg.checkout_url, '_blank');
        toast({
          title: "Redirecionando para pagamento",
          description: "Complete o pagamento na página que abriu.",
        });
        fetchOrders(userId);
      } else {
        toast({ title: "Pagamento não disponível no momento", variant: "destructive" });
      }
    } catch (error: any) {
      console.error('Error creating PIX:', error);
      toast({ title: "Erro ao gerar PIX", description: error.message, variant: "destructive" });
    } finally {
      setBuying(null);
    }
  };

  const copyBrCode = () => {
    if (pixDialog?.br_code) {
      navigator.clipboard.writeText(pixDialog.br_code);
      toast({ title: "Código PIX copiado!" });
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
                      disabled={buying === pkg.id}
                      className="w-full btn-mystic"
                      size="lg"
                    >
                      {buying === pkg.id ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <QrCode className="w-4 h-4 mr-2" />
                      )}
                      {buying === pkg.id ? "Gerando PIX..." : "Pagar via PIX"}
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

      {/* PIX QR Code Dialog */}
      <Dialog open={!!pixDialog} onOpenChange={(open) => !open && setPixDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Pague via PIX</DialogTitle>
          </DialogHeader>
          {pixDialog && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Escaneie o QR Code ou copie o código PIX abaixo
              </p>
              <div className="flex justify-center">
                <img
                  src={pixDialog.qr_code_image}
                  alt="QR Code PIX"
                  className="w-48 h-48 rounded-lg border"
                />
              </div>
              <div className="text-center space-y-1">
                <div className="text-2xl font-bold text-primary">
                  R$ {Number(pixDialog.amount_brl).toFixed(2).replace('.', ',')}
                </div>
                <div className="text-sm text-yellow-500 font-semibold">
                  {pixDialog.duelcoins_amount.toLocaleString('pt-BR')} DuelCoins
                </div>
              </div>
              {pixDialog.br_code && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Código Copia e Cola:</p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={pixDialog.br_code}
                      className="flex-1 text-xs p-2 rounded border bg-muted font-mono truncate"
                    />
                    <Button variant="outline" size="sm" onClick={copyBrCode}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Após o pagamento, os DuelCoins serão creditados automaticamente em sua conta.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
