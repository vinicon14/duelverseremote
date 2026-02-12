import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useBanCheck } from "@/hooks/useBanCheck";
import { 
  Package, 
  Coins, 
  DollarSign, 
  ShoppingCart, 
  CreditCard, 
  QrCode,
  Copy,
  Check,
  Clock,
  AlertTriangle,
  ExternalLink
} from "lucide-react";

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  image_url: string | null;
  category: string;
  product_type: 'normal' | 'duelcoins' | 'cashout';
  duelcoins_amount: number | null;
  cashout_fee_percentage: number;
  stock_quantity: number;
  is_active: boolean;
  is_digital: boolean;
  delivery_info: string | null;
}

interface CashoutConfig {
  min_amount: number;
  max_amount: number;
  fee_percentage: number;
  processing_days: number;
}

export default function Store() {
  useBanCheck();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [duelcoinsBalance, setDuelcoinsBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCashout, setShowCashout] = useState(false);
  const [cashoutAmount, setCashoutAmount] = useState("");
  const [cashoutConfig, setCashoutConfig] = useState<CashoutConfig>({
    min_amount: 100,
    max_amount: 10000,
    fee_percentage: 10,
    processing_days: 2
  });
  const [copiedCode, setCopiedCode] = useState<string | null);

  useEffect(() => {
    fetchProducts();
    fetchCashoutConfig();
    fetchUserBalance();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shop_products')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching products:', error);
        throw error;
      }
      setProducts(data || []);
    } catch (error: any) {
      console.error('Error fetching products:', error);
      
      if (error.code === 'PGRST116') {
        toast({
          title: "Tabela não encontrada",
          description: "Execute os arquivos SQL da pasta database para instalar as tabelas da loja.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Erro ao carregar produtos",
          description: error.message || "Ocorreu um erro ao carregar os produtos.",
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchCashoutConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'cashout_fee_percentage')
        .single();
      
      if (error) throw error;
      
      setCashoutConfig(prev => ({
        ...prev,
        fee_percentage: parseFloat(data.value) || 10
      }));
    } catch (error) {
      console.error('Error fetching cashout config:', error);
    }
  };

  const fetchUserBalance = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('balance')
        .eq('user_id', user.id)
        .single();
      
      if (error) throw error;
      setDuelcoinsBalance(data?.balance || 0);
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };

  const handleProductPurchase = async (product: Product) => {
    if (product.product_type === 'cashout') {
      setShowCashout(true);
      return;
    }

    setSelectedProduct(product);
    setShowCheckout(true);
  };

  const handleCheckout = async (paymentMethod: 'pix' | 'credit_card') => {
    if (!selectedProduct) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      if (selectedProduct.product_type === 'duelcoins') {
        // Create duelcoins purchase record
        const { error } = await supabase
          .from('duelcoins_purchases')
          .insert({
            user_id: user.id,
            amount: selectedProduct.duelcoins_amount,
            price: selectedProduct.price,
            payment_method: paymentMethod,
            status: 'pending'
          });

        if (error) throw error;

        toast({
          title: "Compra iniciada",
          description: "Seu pedido foi registrado. Complete o pagamento para receber seus DuelCoins."
        });
      } else {
        // Create normal product order
        const { error } = await supabase
          .from('shop_orders')
          .insert({
            user_id: user.id,
            product_id: selectedProduct.id,
            total_price: selectedProduct.price,
            payment_method: paymentMethod,
            status: 'pending'
          });

        if (error) throw error;

        toast({
          title: "Pedido realizado",
          description: "Seu pedido foi registrado. Complete o pagamento para finalizar."
        });
      }

      setShowCheckout(false);
      setSelectedProduct(null);
    } catch (error) {
      toast({
        title: "Erro ao processar pedido",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCashout = async () => {
    const amount = parseInt(cashoutAmount);
    
    if (!amount || amount < cashoutConfig.min_amount) {
      toast({
        title: "Valor inválido",
        description: `O valor mínimo de resgate é ${cashoutConfig.min_amount} DuelCoins.`,
        variant: "destructive"
      });
      return;
    }

    if (amount > duelcoinsBalance) {
      toast({
        title: "Saldo insuficiente",
        description: "Você não tem DuelCoins suficientes para este resgate.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      const feeAmount = Math.ceil((amount * cashoutConfig.fee_percentage) / 100);
      const finalAmount = amount - feeAmount;

      const { error } = await supabase
        .from('duelcoins_cashouts')
        .insert({
          user_id: user.id,
          amount: amount,
          fee_amount: feeAmount,
          final_amount: finalAmount,
          status: 'pending'
        });

      if (error) throw error;

      toast({
        title: "Solicitação de resgada criada",
        description: `Seu pedido de R$ ${finalAmount.toFixed(2)} foi registrado. Aguarde aprovação.`,
      });

      setCashoutAmount("");
      setShowCashout(false);
      
      // Update balance immediately (will be deducted in backend when approved)
      setDuelcoinsBalance(prev => prev - amount);
    } catch (error) {
      toast({
        title: "Erro ao solicitar resgate",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getProductIcon = (type: string) => {
    switch (type) {
      case 'duelcoins':
        return <Coins className="w-6 h-6 text-yellow-500" />;
      case 'cashout':
        return <DollarSign className="w-6 h-6 text-green-500" />;
      default:
        return <Package className="w-6 h-6 text-blue-500" />;
    }
  };

  const getProductBadge = (type: string) => {
    switch (type) {
      case 'duelcoins':
        return <Badge className="bg-yellow-500">DuelCoins</Badge>;
      case 'cashout':
        return <Badge className="bg-green-500">Resgate</Badge>;
      default:
        return <Badge className="bg-blue-500">Produto</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r from-primary to-primary/70 mb-4">
              <ShoppingCart className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold gradient-text">
              Loja Duelverse
            </h1>
            <p className="text-xl text-muted-foreground">
              Produtos exclusivos e DuelCoins para potencializar sua experiência
            </p>
            
            {/* Balance Display */}
            <div className="inline-flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
              <Coins className="w-5 h-5 text-yellow-600" />
              <span className="font-bold text-yellow-800">
                Seu saldo: {duelcoinsBalance} DuelCoins
              </span>
            </div>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <Card key={product.id} className="card-mystic hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      {getProductIcon(product.product_type)}
                      <CardTitle className="text-lg">{product.title}</CardTitle>
                    </div>
                    {getProductBadge(product.product_type)}
                  </div>
                  <CardDescription className="line-clamp-3">
                    {product.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {product.image_url && (
                    <img 
                      src={product.image_url} 
                      alt={product.title}
                      className="w-full h-48 object-cover rounded-md"
                    />
                  )}
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-2xl font-bold text-green-600">
                        R$ {product.price.toFixed(2)}
                      </span>
                      <Badge variant={product.stock_quantity > 0 ? "default" : "destructive"}>
                        {product.stock_quantity} em estoque
                      </Badge>
                    </div>

                    {product.product_type === 'duelcoins' && product.duelcoins_amount && (
                      <div className="flex items-center gap-2 text-yellow-600 bg-yellow-50 p-2 rounded">
                        <Coins className="w-5 h-5" />
                        <span className="font-bold">+{product.duelcoins_amount} DuelCoins</span>
                      </div>
                    )}

                    {product.product_type === 'cashout' && (
                      <div className="text-sm space-y-1">
                        <div className="text-red-600">
                          Taxa: {cashoutConfig.fee_percentage}%
                        </div>
                        <div className="text-muted-foreground">
                          Receba em até {cashoutConfig.processing_days} dias úteis
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant="outline">{product.category}</Badge>
                      {product.is_digital && <Badge variant="outline">Digital</Badge>}
                    </div>

                    {product.delivery_info && product.product_type !== 'cashout' && (
                      <div className="text-sm bg-blue-50 p-2 rounded">
                        <strong>Informações de entrega:</strong><br />
                        {product.delivery_info}
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={() => handleProductPurchase(product)}
                    className="w-full btn-mystic"
                    size="lg"
                    disabled={product.stock_quantity <= 0 || loading}
                  >
                    {product.product_type === 'cashout' ? (
                      <>
                        <DollarSign className="w-4 h-4 mr-2" />
                        Resgatar DuelCoins
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        {product.stock_quantity > 0 ? 'Comprar Agora' : 'Esgotado'}
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Cashout Modal */}
          {showCashout && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <Card className="max-w-md w-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-500" />
                    Resgatar DuelCoins
                  </CardTitle>
                  <CardDescription>
                    Converta seus DuelCoins em dinheiro real
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="cashout-amount">Quantidade de DuelCoins</Label>
                    <Input
                      id="cashout-amount"
                      type="number"
                      min={cashoutConfig.min_amount}
                      max={Math.min(duelcoinsBalance, cashoutConfig.max_amount)}
                      value={cashoutAmount}
                      onChange={(e) => setCashoutAmount(e.target.value)}
                      placeholder={`Mínimo: ${cashoutConfig.min_amount} DuelCoins`}
                    />
                  </div>

                  {cashoutAmount && parseInt(cashoutAmount) >= cashoutConfig.min_amount && (
                    <div className="space-y-2 bg-gray-50 p-3 rounded">
                      <div className="flex justify-between">
                        <span>Valor solicitado:</span>
                        <span>{parseInt(cashoutAmount)} DuelCoins</span>
                      </div>
                      <div className="flex justify-between text-red-600">
                        <span>Taxa ({cashoutConfig.fee_percentage}%):</span>
                        <span>-{Math.ceil((parseInt(cashoutAmount) * cashoutConfig.fee_percentage) / 100)} DuelCoins</span>
                      </div>
                      <div className="flex justify-between font-bold text-green-600 border-t pt-2">
                        <span>Valor a receber:</span>
                        <span>R$ {(parseInt(cashoutAmount) - Math.ceil((parseInt(cashoutAmount) * cashoutConfig.fee_percentage) / 100)).toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  <div className="bg-yellow-50 border border-yellow-200 p-3 rounded">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                      <div className="text-sm text-yellow-800">
                        <strong>Atenção:</strong> Após confirmar, os DuelCoins serão deduzidos da sua conta.
                        Você receberá o dinheiro em até {cashoutConfig.processing_days} dias úteis após aprovação.
                      </div>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCashout(false);
                        setCashoutAmount("");
                      }}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleCashout}
                      disabled={loading || !cashoutAmount || parseInt(cashoutAmount) < cashoutConfig.min_amount}
                      className="flex-1 btn-mystic"
                    >
                      {loading ? 'Processando...' : 'Confirmar Resgate'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Checkout Modal */}
          {showCheckout && selectedProduct && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <Card className="max-w-md w-full">
                <CardHeader>
                  <CardTitle>Finalizar Compra</CardTitle>
                  <CardDescription>
                    {selectedProduct.title}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedProduct.image_url && (
                    <img 
                      src={selectedProduct.image_url} 
                      alt={selectedProduct.title}
                      className="w-full h-40 object-cover rounded-md"
                    />
                  )}
                  
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600">
                      R$ {selectedProduct.price.toFixed(2)}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Forma de pagamento</Label>
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        onClick={() => handleCheckout('pix')}
                        disabled={loading}
                        className="w-full justify-start"
                      >
                        <QrCode className="w-4 h-4 mr-2" />
                        Pagar com PIX
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleCheckout('credit_card')}
                        disabled={loading}
                        className="w-full justify-start"
                      >
                        <CreditCard className="w-4 h-4 mr-2" />
                        Pagar com Cartão
                      </Button>
                    </div>
                  </div>

                  <div className="flex">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCheckout(false);
                        setSelectedProduct(null);
                      }}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {products.length === 0 && !loading && (
            <Card>
              <CardContent className="text-center py-12">
                <ShoppingCart className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhum produto disponível</h3>
                <p className="text-muted-foreground mb-4">
                  Execute os arquivos SQL da pasta database para configurar as tabelas da loja.
                </p>
                <div className="text-left bg-blue-50 p-4 rounded text-sm text-blue-800">
                  <strong>Instruções:</strong><br />
                  1. Acesse o SQL Editor do Supabase<br />
                  2. Execute os 15 arquivos SQL em ordem<br />
                  3. Verifique o arquivo README_INSTALLACAO.md
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}