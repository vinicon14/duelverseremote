/**
 * DuelVerse - Marketplace
 * Desenvolvido por Vinícius
 * 
 * Marketplace para compra de itens digitais e serviços com DuelCoins.
 */
import { useEffect, useState, useCallback } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingCart, Coins, Package, Sparkles, Zap, Minus, Plus, X, Loader2, ShoppingBag, Check } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MarketplaceProduct {
  id: string;
  name: string;
  description: string | null;
  price_duelcoins: number;
  image_url: string | null;
  category: string;
  product_type: string;
  stock: number | null;
  is_active: boolean;
}

interface CartItem {
  product: MarketplaceProduct;
  quantity: number;
}

const categoryLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  digital_item: { label: "Item Digital", icon: <Sparkles className="w-3 h-3" />, color: "bg-primary/20 text-primary" },
  service: { label: "Serviço", icon: <Zap className="w-3 h-3" />, color: "bg-secondary/20 text-secondary" },
  cosmetic: { label: "Cosmético", icon: <Package className="w-3 h-3" />, color: "bg-accent/20 text-accent" },
};

export default function Marketplace() {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [balance, setBalance] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const { toast } = useToast();

  useEffect(() => {
    fetchProducts();
    fetchUser();
  }, []);

  const fetchUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      const { data } = await supabase
        .from("profiles")
        .select("duelcoins_balance")
        .eq("user_id", session.user.id)
        .single();
      if (data) setBalance(data.duelcoins_balance);
    }
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from("marketplace_products")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (!error && data) setProducts(data);
    setLoading(false);
  };

  const addToCart = useCallback((product: MarketplaceProduct) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (product.stock !== null && existing.quantity >= product.stock) {
          return prev;
        }
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    toast({ title: "Adicionado ao carrinho", description: product.name });
  }, [toast]);

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id !== productId) return item;
      const newQty = item.quantity + delta;
      if (newQty <= 0) return item;
      if (item.product.stock !== null && newQty > item.product.stock) return item;
      return { ...item, quantity: newQty };
    }));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.product.price_duelcoins * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleBuyDirect = async (product: MarketplaceProduct) => {
    if (!user) {
      toast({ title: "Faça login", description: "Você precisa estar logado para comprar", variant: "destructive" });
      return;
    }
    setPurchasing(true);
    try {
      const items = [{ product_id: product.id, quantity: 1 }];
      const { data, error } = await supabase.rpc("purchase_marketplace_items", {
        p_items: items as any,
      });
      if (error) throw error;
      const result = data as any;
      if (result.success) {
        toast({ title: "Compra realizada! ✅", description: result.message });
        setPurchaseSuccess(true);
        setTimeout(() => setPurchaseSuccess(false), 2000);
        fetchUser();
        fetchProducts();
      } else {
        toast({ title: "Erro", description: result.message, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setPurchasing(false);
    }
  };

  const handleCheckout = async () => {
    if (!user) {
      toast({ title: "Faça login", description: "Você precisa estar logado para comprar", variant: "destructive" });
      return;
    }
    if (cart.length === 0) return;

    setPurchasing(true);
    try {
      const items = cart.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
      }));
      const { data, error } = await supabase.rpc("purchase_marketplace_items", {
        p_items: items as any,
      });
      if (error) throw error;
      const result = data as any;
      if (result.success) {
        toast({ title: "Compra realizada! ✅", description: `Total: ${result.total} DuelCoins` });
        setCart([]);
        setPurchaseSuccess(true);
        setTimeout(() => setPurchaseSuccess(false), 2000);
        fetchUser();
        fetchProducts();
      } else {
        toast({ title: "Erro", description: result.message, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setPurchasing(false);
    }
  };

  const filteredProducts = filter === "all" ? products : products.filter(p => p.category === filter);

  const categories = ["all", ...Array.from(new Set(products.map(p => p.category)))];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <ShoppingBag className="w-8 h-8 text-primary" />
              <h1 className="text-4xl font-bold text-gradient-mystic">Marketplace</h1>
            </div>
            <p className="text-muted-foreground">
              Compre itens exclusivos com seus DuelCoins
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Balance */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border">
              <Coins className="w-5 h-5 text-secondary" />
              <span className="font-bold text-secondary">{balance.toLocaleString()}</span>
            </div>

            {/* Cart button */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="relative">
                  <ShoppingCart className="w-5 h-5" />
                  {cartCount > 0 && (
                    <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                      {cartCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[380px]">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    Carrinho ({cartCount})
                  </SheetTitle>
                </SheetHeader>

                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground">
                    <ShoppingCart className="w-16 h-16 mb-4 opacity-30" />
                    <p>Carrinho vazio</p>
                  </div>
                ) : (
                  <>
                    <ScrollArea className="h-[calc(100vh-280px)] mt-4">
                      <div className="space-y-3 pr-2">
                        {cart.map(item => (
                          <div key={item.product.id} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
                            {item.product.image_url ? (
                              <img src={item.product.image_url} alt={item.product.name} className="w-12 h-12 rounded object-cover" />
                            ) : (
                              <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                                <Package className="w-6 h-6 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{item.product.name}</p>
                              <p className="text-xs text-secondary flex items-center gap-1">
                                <Coins className="w-3 h-3" />
                                {item.product.price_duelcoins}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.product.id, -1)}>
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.product.id, 1)}>
                                <Plus className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(item.product.id)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>

                    <div className="mt-4 space-y-3">
                      <Separator />
                      <div className="flex justify-between items-center text-lg font-bold">
                        <span>Total</span>
                        <span className="text-secondary flex items-center gap-1">
                          <Coins className="w-5 h-5" />
                          {cartTotal.toLocaleString()}
                        </span>
                      </div>
                      {cartTotal > balance && (
                        <p className="text-xs text-destructive">Saldo insuficiente</p>
                      )}
                      <Button
                        className="w-full btn-mystic"
                        disabled={purchasing || cartTotal > balance}
                        onClick={handleCheckout}
                      >
                        {purchasing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                        Finalizar Compra
                      </Button>
                    </div>
                  </>
                )}
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {categories.map(cat => (
            <Button
              key={cat}
              variant={filter === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(cat)}
              className={filter === cat ? "btn-mystic" : ""}
            >
              {cat === "all" ? "Todos" : categoryLabels[cat]?.label || cat}
            </Button>
          ))}
        </div>

        {/* Products Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <ShoppingBag className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg">Nenhum produto disponível</p>
            <p className="text-sm">Volte em breve para novos itens!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map(product => {
              const catInfo = categoryLabels[product.category] || categoryLabels.digital_item;
              return (
                <Card key={product.id} className="group bg-card border-border hover:border-primary/40 transition-all duration-300 hover:shadow-[0_0_30px_-5px_hsl(var(--primary)/0.3)] overflow-hidden">
                  {/* Image */}
                  <div className="aspect-square relative overflow-hidden bg-muted">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-16 h-16 text-muted-foreground/30" />
                      </div>
                    )}
                    <Badge className={`absolute top-3 left-3 ${catInfo.color} border-0 gap-1`}>
                      {catInfo.icon}
                      {catInfo.label}
                    </Badge>
                    {product.stock !== null && product.stock <= 5 && product.stock > 0 && (
                      <Badge className="absolute top-3 right-3 bg-destructive/90 text-destructive-foreground border-0">
                        Restam {product.stock}
                      </Badge>
                    )}
                    {product.stock !== null && product.stock <= 0 && (
                      <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                        <span className="text-xl font-bold text-destructive">Esgotado</span>
                      </div>
                    )}
                  </div>

                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg line-clamp-1">{product.name}</CardTitle>
                    {product.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
                    )}
                  </CardHeader>

                  <CardFooter className="flex items-center justify-between pt-0">
                    <div className="flex items-center gap-1 text-secondary font-bold text-lg">
                      <Coins className="w-5 h-5" />
                      {product.price_duelcoins.toLocaleString()}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addToCart(product)}
                        disabled={product.stock !== null && product.stock <= 0}
                      >
                        <ShoppingCart className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        className="btn-mystic"
                        onClick={() => handleBuyDirect(product)}
                        disabled={purchasing || (product.stock !== null && product.stock <= 0)}
                      >
                        Comprar
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
