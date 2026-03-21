import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { DuelCoinsBalance } from "@/components/DuelCoinsBalance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Coins, ShoppingCart, Star, History, Loader2, Copy, CheckCircle2, QrCode, X, CreditCard } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  qr_code: string;
  qr_code_base64: string;
  ticket_url: string;
  amount_brl: number;
  duelcoins_amount: number;
  payment_id: string;
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
  const [buyingCard, setBuyingCard] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    if (!pixData || !pixDialogOpen) {
      if (pollInterval.current) clearInterval(pollInterval.current);
      return;
    }

    pollInterval.current = setInterval(async () => {
      const { data: order } = await supabase
        .from('duelcoins_orders')
        .select('status')
        .eq('external_order_id', String(pixData.payment_id))
        .single();

      if (order?.status === 'paid') {
        clearInterval(pollInterval.current!);
        setPixDialogOpen(false);
        setPixData(null);
        toast({ title: "✅ Pagamento confirmado!", description: "Seus DuelCoins foram creditados!" });
        fetchOrders(userId);
      }
    }, 5000);

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [pixData, pixDialogOpen]);

  const checkAuthAndLoad = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
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

  const handleBuyPix = async (pkg: DuelCoinsPackage) => {
    setBuying(pkg.id);
    try {
      const { data, error } = await supabase.functions.invoke('mercadopago-create-pix', {
        body: { package_id: pkg.id },
      });

      if (error) throw error;

      if (data?.success) {
        setPixData({
          qr_code: data.qr_code,
          qr_code_base64: data.qr_code_base64,
          ticket_url: data.ticket_url,
          amount_brl: data.amount_brl,
          duelcoins_amount: data.duelcoins_amount,
          payment_id: data.payment_id,
        });
        setPixDialogOpen(true);
        setCopied(false);
      } else {
        toast({ title: "Erro ao gerar PIX", description: data?.error, variant: "destructive" });
      }
    } catch (error: any) {
      console.error('Error creating PIX:', error);
      toast({ title: "Erro ao processar pagamento", description: error.message, variant: "destructive" });
    } finally {
      setBuying(null);
    }
  };

  const handleBuyCard = async (pkg: DuelCoinsPackage) => {
    setBuyingCard(pkg.id);
    try {
      const { data, error } = await supabase.functions.invoke('mercadopago-create-checkout', {
        body: { package_id: pkg.id, origin_url: window.location.origin },
      });

      if (error) throw error;

      if (data?.success && data?.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        toast({ title: "Erro ao criar checkout", description: data?.error, variant: "destructive" });
      }
    } catch (error: any) {
      console.error('Error creating checkout:', error);
      toast({ title: "Erro ao processar pagamento", description: error.message, variant: "destructive" });
    } finally {
      setBuyingCard(null);
    }
  };

  const handleCopyPix = async () => {
    if (!pixData?.qr_code) return;
    try {
      await navigator.clipboard.writeText(pixData.qr_code);
      setCopied(true);
      toast({ title: "Código PIX copiado!" });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
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
              Adquira DuelCoins de forma rápida e segura via PIX ou Cartão
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
                    <div className="flex flex-col gap-2">
                      <Button
                        onClick={() => handleBuyPix(pkg)}
                        disabled={buying === pkg.id || buyingCard === pkg.id}
                        className="w-full btn-mystic"
                        size="lg"
                      >
                        {buying === pkg.id ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <QrCode className="w-4 h-4 mr-2" />
                        )}
                        {buying === pkg.id ? "Gerando PIX..." : "Pagar com PIX"}
                      </Button>
                      <Button
                        onClick={() => handleBuyCard(pkg)}
                        disabled={buying === pkg.id || buyingCard === pkg.id}
                        variant="outline"
                        className="w-full"
                        size="lg"
                      >
                        {buyingCard === pkg.id ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <CreditCard className="w-4 h-4 mr-2" />
                        )}
                        {buyingCard === pkg.id ? "Redirecionando..." : "Cartão de Crédito/Débito"}
                      </Button>
                    </div>
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
      <Dialog open={pixDialogOpen} onOpenChange={setPixDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              Pagamento via PIX
            </DialogTitle>
          </DialogHeader>
          {pixData && (
            <div className="space-y-4 text-center">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="text-sm text-muted-foreground">Valor</p>
                <p className="text-2xl font-bold text-primary">
                  R$ {Number(pixData.amount_brl).toFixed(2).replace('.', ',')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {pixData.duelcoins_amount.toLocaleString('pt-BR')} DuelCoins
                </p>
              </div>

              {pixData.qr_code_base64 && (
                <div className="flex justify-center">
                  <img
                    src={`data:image/png;base64,${pixData.qr_code_base64}`}
                    alt="QR Code PIX"
                    className="w-48 h-48 rounded-lg border"
                  />
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Ou copie o código PIX:</p>
                <div className="flex gap-2">
                  <code className="flex-1 bg-muted p-2 rounded text-xs break-all max-h-20 overflow-y-auto text-left">
                    {pixData.qr_code}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyPix}
                    className="shrink-0"
                  >
                    {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Aguardando pagamento...
              </div>

              <p className="text-xs text-muted-foreground">
                O pagamento será confirmado automaticamente. Este QR Code expira em 30 minutos.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
