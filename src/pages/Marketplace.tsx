/**
 * DuelVerse - Marketplace
 * Desenvolvido by Vinícius
 * 
 * Marketplace para compra de itens digitais e serviços com DuelCoins.
 * Inclui aba de Anunciantes Terceiros para usuários PRO.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAccountType } from "@/hooks/useAccountType";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingCart, Coins, Package, Sparkles, Zap, Minus, Plus, X, Loader2, ShoppingBag, Check, Store as StoreIcon, PlusCircle, Tag, Crown, Upload, Image } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  seller_id: string | null;
  is_third_party_seller: boolean;
  is_approved: boolean;
  metadata: any;
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
  const navigate = useNavigate();
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [thirdPartyProducts, setThirdPartyProducts] = useState<MarketplaceProduct[]>([]);
  const [myProducts, setMyProducts] = useState<MarketplaceProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [balance, setBalance] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const { isPro } = useAccountType();
  const [createProductDialogOpen, setCreateProductDialogOpen] = useState(false);
  const [editProductDialogOpen, setEditProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MarketplaceProduct | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Erro', description: 'Por favor, selecione uma imagem', variant: 'destructive' });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Erro', description: 'A imagem deve ter no máximo 5MB', variant: 'destructive' });
      return;
    }

    setUploadingImage(true);
    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const filePath = `marketplace/${user?.id || 'public'}/${fileName}`;

      const { data, error } = await supabase.storage
        .from('marketplace-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('marketplace-images')
        .getPublicUrl(filePath);

      setNewProduct({ ...newProduct, image_url: publicUrl });
      toast({ title: 'Sucesso', description: 'Imagem carregada com sucesso!' });
    } catch (err: any) {
      console.error('Upload error:', err);
      toast({ title: 'Erro', description: 'Falha ao carregar imagem: ' + err.message, variant: 'destructive' });
    } finally {
      setUploadingImage(false);
    }
  };

  const clearImage = () => {
    setImagePreview(null);
    setNewProduct({ ...newProduct, image_url: '' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  const [newProduct, setNewProduct] = useState({
    name: "",
    description: "",
    price_duelcoins: 0,
    category: "digital_item",
    product_type: "one_time",
    stock: null as number | null,
    image_url: "",
    item_type: "" as string,
  });

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
    // Fetch all active products
    const { data: allData, error: allError } = await (supabase
      .from("marketplace_products")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false }));

    if (allError) {
      console.error('Error fetching products:', allError);
      toast({ title: 'Erro', description: 'Falha ao carregar produtos', variant: 'destructive' });
      return;
    }

    if (allData) {
      // Split into official and third-party
      const official = allData.filter((p) => !p.is_third_party_seller);
      const thirdParty = allData.filter((p) => p.is_third_party_seller);
      setProducts(official);
      setThirdPartyProducts(thirdParty);
    }

    setLoading(false);
  };

  const fetchMyProducts = async () => {
    if (!user) return;
    const { data, error } = await supabase
        .from("marketplace_products")
        .select("*")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false });

    if (!error && data) setMyProducts(data);
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

    // Check stock if applicable
    if (product.stock !== null && product.stock <= 0) {
      toast({ title: "Erro", description: "Produto sem estoque", variant: "destructive" });
      return;
    }

    setPurchasing(true);
    try {
      // Check balance first
      const { data: profile } = await supabase
        .from('profiles')
        .select('duelcoins_balance')
        .eq('user_id', user.id)
        .single();

      if (!profile || profile.duelcoins_balance < product.price_duelcoins) {
        toast({ title: "Saldo insuficiente", description: "Você não tem DuelCoins suficientes", variant: "destructive" });
        setPurchasing(false);
        return;
      }

      // Deduct balance
      await supabase
        .from('profiles')
        .update({ duelcoins_balance: profile.duelcoins_balance - product.price_duelcoins })
        .eq('user_id', user.id);

      // Reduce stock if applicable
      if (product.stock !== null) {
        await supabase
          .from('marketplace_products')
          .update({ stock: product.stock - 1 })
          .eq('id', product.id);
      }

      // Record transaction
      await supabase
        .from('duelcoins_transactions')
        .insert({
          sender_id: user.id,
          amount: product.price_duelcoins,
          transaction_type: 'marketplace_purchase',
          description: `Compra: ${product.name}`
        });

      // Add to inventory
      const { error: inventoryError } = await supabase
        .from('user_inventory' as any)
        .insert({
          user_id: user.id,
          product_id: product.id,
          quantity: 1,
          is_used: false
        });

      if (inventoryError) {
        console.error('Inventory error:', inventoryError);
        throw new Error(`Erro ao adicionar ao inventário: ${inventoryError.message}`);
      }

      // Record purchase
      const { error: purchaseError } = await supabase
        .from('marketplace_purchases')
        .insert({
          user_id: user.id,
          product_id: product.id,
          quantity: 1,
          total_price: product.price_duelcoins,
          status: 'completed'
        });

      if (purchaseError) {
        console.error('Purchase error:', purchaseError);
        throw new Error(`Erro ao registrar compra: ${purchaseError.message}`);
      }

      // Get buyer username
      const { data: buyerData } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', user.id)
        .single();

      // Notify all admins about the purchase
      const { data: admins } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (admins && admins.length > 0) {
        const notifications = admins.map((admin) => ({
          user_id: admin.user_id,
          type: 'marketplace_purchase',
          title: 'Nova Compra! 💰',
          message: `${buyerData?.username || 'Um usuário'} comprou ${product.name} por ${product.price_duelcoins} DuelCoins`,
          read: false
        }));

        await supabase
          .from('notifications')
          .insert(notifications);
      }

      toast({ 
        title: "Compra realizada! ✅", 
        description: `Você comprou ${product.name}! Verifique em Meus Itens.`,
        duration: 5000
      });
      setPurchaseSuccess(true);
      setTimeout(() => setPurchaseSuccess(false), 2000);
      fetchUser();
      fetchProducts();
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

    // Check stock for all items
    for (const item of cart) {
      if (item.product.stock !== null && item.product.stock < item.quantity) {
        toast({ title: "Estoque insuficiente", description: `Produto ${item.product.name} não tem estoque suficiente`, variant: "destructive" });
        return;
      }
    }

    setPurchasing(true);
    try {
      const total = cart.reduce((sum, item) => sum + item.product.price_duelcoins * item.quantity, 0);

      // Check balance first
      const { data: profile } = await supabase
        .from('profiles')
        .select('duelcoins_balance')
        .eq('user_id', user.id)
        .single();

      if (!profile || profile.duelcoins_balance < total) {
        toast({ title: "Saldo insuficiente", description: "Você não tem DuelCoins suficientes", variant: "destructive" });
        setPurchasing(false);
        return;
      }

      // Deduct balance
      await supabase
        .from('profiles')
        .update({ duelcoins_balance: profile.duelcoins_balance - total })
        .eq('user_id', user.id);

      // Reduce stock for each item
      for (const item of cart) {
        if (item.product.stock !== null) {
          await supabase
            .from('marketplace_products')
            .update({ stock: item.product.stock - item.quantity })
            .eq('id', item.product.id);
        }
      }

      // Record transaction
      await supabase
        .from('duelcoins_transactions')
        .insert({
          sender_id: user.id,
          amount: total,
          transaction_type: 'marketplace_purchase',
          description: `Compra no carrinho: ${cart.length} itens`
        });

      // Process each item
      for (const item of cart) {
        // Add to inventory
        const { error: inventoryError } = await supabase
          .from('user_inventory' as any)
          .insert({
            user_id: user.id,
            product_id: item.product.id,
            quantity: item.quantity,
            is_used: false
          });

        if (inventoryError) {
          console.error('Inventory error:', inventoryError);
          throw new Error(`Erro ao adicionar ${item.product.name} ao inventário: ${inventoryError.message}`);
        }

        // Record purchase
        const { error: purchaseError } = await supabase
          .from('marketplace_purchases')
          .insert({
            user_id: user.id,
            product_id: item.product.id,
            quantity: item.quantity,
            total_price: item.product.price_duelcoins * item.quantity,
            status: 'completed'
          });

        if (purchaseError) {
          console.error('Purchase error:', purchaseError);
          throw new Error(`Erro ao registrar compra de ${item.product.name}: ${purchaseError.message}`);
        }
      }

      // Notify about the purchase
      const buyerItems = cart.map(item => item.product.name).join(', ');
      
      // Get buyer username
      const { data: buyerData } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', user.id)
        .single();

      // Notify all admins about the purchase
      const { data: admins } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (admins && admins.length > 0) {
        const notifications = admins.map((admin) => ({
          user_id: admin.user_id,
          type: 'marketplace_purchase',
          title: 'Nova Compra no Carrinho! 💰',
          message: `${buyerData?.username || 'Um usuário'} comprou ${cart.length} itens (${buyerItems}) por ${total} DuelCoins`,
          read: false
        }));

        await supabase
          .from('notifications')
          .insert(notifications);
      }

      toast({ 
        title: "Compra realizada! ✅", 
        description: `Total: ${total} DuelCoins! Verifique em Meus Itens.`,
        duration: 5000
      });
      setCart([]);
      setPurchaseSuccess(true);
      setTimeout(() => setPurchaseSuccess(false), 2000);
      fetchUser();
      fetchProducts();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setPurchasing(false);
    }
  };

  const handleCreateProduct = async () => {
    if (!isPro) {
      toast({ title: "Apenas PRO", description: "Apenas usuários PRO podem criar produtos para venda", variant: "destructive" });
      return;
    }

    if (!newProduct.name || newProduct.price_duelcoins <= 0) {
      toast({ title: "Erro", description: "Nome e preço são obrigatórios", variant: "destructive" });
      return;
    }

    setCreatingProduct(true);
    try {
      // Insert product directly
      const { data, error } = await supabase
        .from('marketplace_products')
        .insert({
          name: newProduct.name,
          description: newProduct.description,
          price_duelcoins: newProduct.price_duelcoins,
          category: newProduct.category,
          product_type: newProduct.product_type,
          stock: newProduct.stock,
          image_url: newProduct.image_url || null,
          seller_id: user?.id,
          is_third_party_seller: true,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        toast({ title: "Sucesso! ✅", description: "Produto criado com sucesso!" });
        setCreateProductDialogOpen(false);
        setNewProduct({
          name: "",
          description: "",
          price_duelcoins: 0,
          category: "digital_item",
          product_type: "one_time",
          stock: null,
          image_url: "",
        });
        setImagePreview(null);
        fetchMyProducts();
        fetchProducts();
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setCreatingProduct(false);
    }
  };

  useEffect(() => {
    if (isPro && user) {
      fetchMyProducts();
    }
  }, [isPro, user]);

  const filteredProducts = filter === "all" 
    ? products 
    : products.filter(p => p.category === filter);

  const filteredThirdParty = filter === "all"
    ? thirdPartyProducts
    : thirdPartyProducts.filter(p => p.category === filter);

  const categories = ["all", ...Array.from(new Set(products.map(p => p.category)))];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 pt-24">
        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <Button variant="outline" onClick={() => navigate('/store')}>
            <StoreIcon className="w-4 h-4 mr-2" />
            Planos Pro
          </Button>
          <Button className="btn-mystic">
            <ShoppingBag className="w-4 h-4 mr-2" />
            Marketplace
          </Button>
          {isPro && (
            <Button variant="outline" onClick={() => navigate('/my-items')}>
              <Tag className="w-4 h-4 mr-2" />
              Meus Itens
            </Button>
          )}
        </div>

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

        {/* Tabs for Marketplace */}
        <Tabs defaultValue="official" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="official" className="gap-2">
              <StoreIcon className="w-4 h-4" />
              Loja Oficial
            </TabsTrigger>
            <TabsTrigger value="third-party" className="gap-2">
              <Tag className="w-4 h-4" />
              Anunciantes Terceiros
            </TabsTrigger>
            {isPro && (
              <TabsTrigger value="my-products" className="gap-2">
                <Crown className="w-4 h-4 text-yellow-500" />
                Meus Produtos
              </TabsTrigger>
            )}
          </TabsList>

          {/* Official Products Tab */}
          <TabsContent value="official">
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
                      <div className="aspect-square relative overflow-hidden bg-muted">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
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
                      </CardHeader>

                      <CardFooter className="flex items-center justify-between pt-0">
                        <div className="flex items-center gap-1 text-secondary font-bold text-lg">
                          <Coins className="w-5 h-5" />
                          {product.price_duelcoins.toLocaleString()}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => addToCart(product)} disabled={product.stock !== null && product.stock <= 0}>
                            <ShoppingCart className="w-4 h-4" />
                          </Button>
                          <Button size="sm" className="btn-mystic" onClick={() => handleBuyDirect(product)} disabled={purchasing || (product.stock !== null && product.stock <= 0)}>
                            Comprar
                          </Button>
                        </div>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Third Party Products Tab */}
          <TabsContent value="third-party">
            {/* Category Filters for Third Party */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {categories.map(cat => (
                <Button
                  key={`tp-${cat}`}
                  variant={filter === cat ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(cat)}
                  className={filter === cat ? "btn-mystic" : ""}
                >
                  {cat === "all" ? "Todos" : categoryLabels[cat]?.label || cat}
                </Button>
              ))}
            </div>

            {filteredThirdParty.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Tag className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg">Nenhum produto de terceiros</p>
                <p className="text-sm">Anunciantes terceiros aparecerão aqui</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredThirdParty.map(product => {
                  const catInfo = categoryLabels[product.category] || categoryLabels.digital_item;
                  return (
                    <Card key={product.id} className="group bg-card border-border hover:border-primary/40 transition-all duration-300 hover:shadow-[0_0_30px_-5px_hsl(var(--primary)/0.3)] overflow-hidden">
                      <div className="aspect-square relative overflow-hidden bg-muted">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-16 h-16 text-muted-foreground/30" />
                          </div>
                        )}
                        <Badge className={`absolute top-3 left-3 ${catInfo.color} border-0 gap-1`}>
                          {catInfo.icon}
                          {catInfo.label}
                        </Badge>
                        <Badge className="absolute top-3 right-3 bg-yellow-500/90 text-yellow-foreground border-0 gap-1">
                          <Tag className="w-3 h-3" />
                          Terceiro
                        </Badge>
                      </div>

                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg line-clamp-1">{product.name}</CardTitle>
                      </CardHeader>

                      <CardFooter className="flex items-center justify-between pt-0">
                        <div className="flex items-center gap-1 text-secondary font-bold text-lg">
                          <Coins className="w-5 h-5" />
                          {product.price_duelcoins.toLocaleString()}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => addToCart(product)} disabled={product.stock !== null && product.stock <= 0}>
                            <ShoppingCart className="w-4 h-4" />
                          </Button>
                          <Button size="sm" className="btn-mystic" onClick={() => handleBuyDirect(product)} disabled={purchasing || (product.stock !== null && product.stock <= 0)}>
                            Comprar
                          </Button>
                        </div>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* My Products Tab (PRO only) */}
          {isPro && (
            <TabsContent value="my-products">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Meus Produtos</h2>
                <Button className="btn-mystic" onClick={() => setCreateProductDialogOpen(true)}>
                  <PlusCircle className="w-4 h-4 mr-2" />
                  Criar Produto
                </Button>
              </div>

              {myProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Package className="w-16 h-16 mb-4 opacity-30" />
                  <p className="text-lg">Você não tem produtos</p>
                  <p className="text-sm">Crie seu primeiro produto para vender!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {myProducts.map(product => {
                    const catInfo = categoryLabels[product.category] || categoryLabels.digital_item;
                    return (
                      <Card key={product.id} className="group bg-card border-border hover:border-primary/40 transition-all duration-300 overflow-hidden">
                        <div className="aspect-square relative overflow-hidden bg-muted">
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-16 h-16 text-muted-foreground/30" />
                            </div>
                          )}
                          <Badge className={`absolute top-3 left-3 ${catInfo.color} border-0 gap-1`}>
                            {catInfo.icon}
                            {catInfo.label}
                          </Badge>
                          <Badge className={`absolute top-3 right-3 ${product.is_active ? 'bg-green-500/90' : 'bg-red-500/90'} text-white border-0`}>
                            {product.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>

                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg line-clamp-1">{product.name}</CardTitle>
                        </CardHeader>

                        <CardFooter className="flex items-center justify-between pt-0">
                          <div className="flex items-center gap-1 text-secondary font-bold text-lg">
                            <Coins className="w-5 h-5" />
                            {product.price_duelcoins.toLocaleString()}
                          </div>
                          {product.stock !== null && (
                            <Badge variant="outline">Estoque: {product.stock}</Badge>
                          )}
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>

        {/* Create Product Dialog */}
        <Dialog open={createProductDialogOpen} onOpenChange={setCreateProductDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Criar Novo Produto</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Produto *</Label>
                <Input
                  id="name"
                  placeholder="Ex: Pacote de Cartas Premium"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  placeholder="Descreva seu produto..."
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Preço (DuelCoins) *</Label>
                  <Input
                    id="price"
                    type="number"
                    min="1"
                    placeholder="100"
                    value={newProduct.price_duelcoins || ""}
                    onChange={(e) => setNewProduct({ ...newProduct, price_duelcoins: parseInt(e.target.value) || 0 })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stock">Estoque (opcional)</Label>
                  <Input
                    id="stock"
                    type="number"
                    min="1"
                    placeholder="Ilimitado"
                    value={newProduct.stock || ""}
                    onChange={(e) => setNewProduct({ ...newProduct, stock: e.target.value ? parseInt(e.target.value) : null })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={newProduct.category} onValueChange={(value) => setNewProduct({ ...newProduct, category: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="digital_item">Item Digital</SelectItem>
                      <SelectItem value="service">Serviço</SelectItem>
                      <SelectItem value="cosmetic">Cosmético</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={newProduct.product_type} onValueChange={(value) => setNewProduct({ ...newProduct, product_type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one_time">Uma vez</SelectItem>
                      <SelectItem value="subscription">Assinatura</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Imagem do Produto</Label>
                <div className="flex gap-2 items-start">
                  <div className="flex-1">
                    <Input
                      id="image"
                      type="file"
                      accept="image/*"
                      ref={fileInputRef}
                      onChange={handleImageChange}
                      className="hidden"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage}
                      >
                        {uploadingImage ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <Upload className="w-4 h-4 mr-2" />
                        )}
                        {imagePreview ? 'Trocar Imagem' : 'Upload Imagem'}
                      </Button>
                      {imagePreview && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={clearImage}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Ou insira uma URL:
                    </p>
                    <Input
                      placeholder="https://..."
                      value={newProduct.image_url}
                      onChange={(e) => setNewProduct({ ...newProduct, image_url: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  {imagePreview && (
                    <div className="w-20 h-20 rounded-lg overflow-hidden border">
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateProductDialogOpen(false)}>
                Cancelar
              </Button>
              <Button className="btn-mystic" onClick={handleCreateProduct} disabled={creatingProduct}>
                {creatingProduct ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlusCircle className="w-4 h-4 mr-2" />}
                Criar Produto
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
