/**
 * DuelVerse - Meus Itens
 * Desenvolvido por Vinícius
 * 
 * Página para visualizar, transferir e usar itens do inventário.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Package, Gift, Send, Zap, Loader2, History, ShoppingCart, Clock, Truck, CheckCircle, X, Coins, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ProductInfo {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string;
  metadata: Record<string, unknown>;
}

interface InventoryItem {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  is_used: boolean;
  used_at: string | null;
  created_at: string;
  product?: ProductInfo;
}

interface Purchase {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  total_price: number;
  status: string;
  created_at: string;
  product_name?: string;
  product_image?: string;
}

const ORDER_STATUSES = [
  { value: 'pending', label: 'Pendente', color: 'bg-yellow-500' },
  { value: 'preparing', label: 'Em Preparação', color: 'bg-blue-500' },
  { value: 'shipping', label: 'A Caminho', color: 'bg-orange-500' },
  { value: 'delivered', label: 'Entregue', color: 'bg-green-500' },
  { value: 'cancelled', label: 'Cancelado', color: 'bg-red-500' },
];

export default function MyItems() {
  const navigate = useNavigate();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [usedItems, setUsedItems] = useState<InventoryItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [recipientUsername, setRecipientUsername] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [usingItem, setUsingItem] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCosmeticDescription, setShowCosmeticDescription] = useState(false);
  const [cosmeticDescription, setCosmeticDescription] = useState<string>("");
  const [cosmeticItemName, setCosmeticItemName] = useState<string>("");
  const [pendingCosmeticItem, setPendingCosmeticItem] = useState<InventoryItem | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchUserAndInventory();
  }, []);

  const fetchUserAndInventory = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser({ id: session.user.id });
      fetchInventory(session.user.id);
      fetchPurchases(session.user.id);
    }
    setLoading(false);
  };

  const fetchPurchases = async (userId: string) => {
    const { data, error } = await supabase
      .from('marketplace_purchases')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      // Fetch product details
      const productIds = [...new Set(data.map((p: Purchase) => p.product_id))];
      const { data: productsData } = await supabase
        .from('marketplace_products')
        .select('id, name, image_url')
        .in('id', productIds);

      const productMap = new Map(productsData?.map(p => [p.id, { name: p.name, image_url: p.image_url }]) || []);

      const purchasesWithDetails = data.map((p: Purchase) => ({
        ...p,
        product_name: productMap.get(p.product_id)?.name || 'Produto desconhecido',
        product_image: productMap.get(p.product_id)?.image_url || null,
      }));

      setPurchases(purchasesWithDetails);
    }
  };

  const fetchInventory = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_inventory")
      .select(`
        *,
        product:marketplace_products(
          id,
          name,
          description,
          image_url,
          category,
          metadata
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const allItems = data as InventoryItem[];
      const active = allItems.filter((item) => !item.is_used);
      const used = allItems.filter((item) => item.is_used);
      setInventory(active);
      setUsedItems(used);
    }
  };

  const handleTransfer = async () => {
    if (!selectedItem || !recipientUsername.trim()) {
      toast({ title: "Erro", description: "Selecione um item e insira o nome do destinatário", variant: "destructive" });
      return;
    }

    setTransferring(true);
    try {
      // First, find the recipient user by username
      const { data: recipientData, error: recipientError } = await supabase
        .from("profiles")
        .select("user_id, username")
        .ilike("username", recipientUsername.trim())
        .single();

      if (recipientError || !recipientData) {
        toast({ title: "Erro", description: "Usuário não encontrado", variant: "destructive" });
        setTransferring(false);
        return;
      }

      // Call the transfer function
      const { data, error } = await supabase.rpc("transfer_inventory_item", {
        p_inventory_id: selectedItem.id,
        p_recipient_id: recipientData.user_id,
      });

      if (error) throw error;

      const result = data as { success: boolean; message: string };
      if (result.success) {
        toast({ title: "Sucesso! ✅", description: result.message });
        setTransferDialogOpen(false);
        setSelectedItem(null);
        setRecipientUsername("");
        if (user) {
          fetchInventory(user.id);
        }
      } else {
        toast({ title: "Erro", description: result.message, variant: "destructive" });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ title: "Erro", description: errorMessage, variant: "destructive" });
    } finally {
      setTransferring(false);
    }
  };

  const handleUseItem = async (item: InventoryItem) => {
    // Check if it's a cosmetic item with description
    const isCosmetic = item.product?.category === 'cosmetic';
    const hasDescription = item.product?.description && item.product.description.trim().length > 0;
    
    if (isCosmetic && hasDescription) {
      // Show the description first before marking as used
      setCosmeticDescription(item.product.description);
      setCosmeticItemName(item.product.name || 'Item Cosmético');
      setPendingCosmeticItem(item);
      setShowCosmeticDescription(true);
      return;
    }
    
    // For non-cosmetic items, mark as used directly
    await processUseItem(item);
  };

  const processUseItem = async (item: InventoryItem) => {
    setUsingItem(true);
    try {
      const { data, error } = await supabase.rpc("use_inventory_item", {
        p_inventory_id: item.id,
      });

      if (error) throw error;

      const result = data as { success: boolean; message: string };
      if (result.success) {
        toast({ title: "Sucesso! ✅", description: result.message });
        if (user) {
          fetchInventory(user.id);
        }
      } else {
        toast({ title: "Erro", description: result.message, variant: "destructive" });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ title: "Erro", description: errorMessage, variant: "destructive" });
    } finally {
      setUsingItem(false);
    }
  };

  const handleConfirmCosmeticUse = async () => {
    setShowCosmeticDescription(false);
    if (pendingCosmeticItem) {
      await processUseItem(pendingCosmeticItem);
      setPendingCosmeticItem(null);
    }
  };

  const openTransferDialog = (item: InventoryItem) => {
    setSelectedItem(item);
    setTransferDialogOpen(true);
  };

  const categoryLabels: Record<string, { label: string; color: string }> = {
    digital_item: { label: "Item Digital", color: "bg-primary/20 text-primary" },
    service: { label: "Serviço", color: "bg-secondary/20 text-secondary" },
    cosmetic: { label: "Cosmético", color: "bg-accent/20 text-accent" },
  };

  const filteredInventory = inventory.filter(item => 
    item.product?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.product?.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUsedItems = usedItems.filter(item => 
    item.product?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.product?.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderItemCard = (item: InventoryItem, showActions: boolean = true) => {
    const catInfo = item.product?.category ? categoryLabels[item.product.category] : categoryLabels.digital_item;
    
    return (
      <Card key={item.id} className="bg-card border-border hover:border-primary/30 transition-all duration-300">
        <div className="flex gap-4 p-4">
          {/* Image */}
          <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0">
            {item.product?.image_url ? (
              <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-8 h-8 text-muted-foreground/50" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold truncate">{item.product?.name || "Item Desconhecido"}</h3>
                {item.product?.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{item.product.description}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <Badge className={`${catInfo.color} border-0 text-xs`}>
                    {catInfo.label}
                  </Badge>
                  {item.quantity > 1 && (
                    <Badge variant="outline" className="text-xs">
                      x{item.quantity}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            {showActions && (
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openTransferDialog(item)}
                  className="flex-1"
                >
                  <Send className="w-4 h-4 mr-1" />
                  Transferir
                </Button>
                <Button
                  size="sm"
                  className="btn-mystic flex-1"
                  onClick={() => handleUseItem(item)}
                  disabled={usingItem}
                >
                  <Zap className="w-4 h-4 mr-1" />
                  Usar
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 pt-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Gift className="w-8 h-8 text-primary" />
              <h1 className="text-4xl font-bold text-gradient-mystic">Meus Itens</h1>
            </div>
            <p className="text-muted-foreground">
              Gerencie seus itens comprados no Marketplace
            </p>
          </div>

          <Button variant="outline" onClick={() => navigate('/marketplace')}>
            <Package className="w-4 h-4 mr-2" />
            Marketplace
          </Button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <Input
            placeholder="Buscar itens..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="active" className="gap-2">
              <Package className="w-4 h-4" />
              Ativos ({inventory.length})
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2">
              <ShoppingCart className="w-4 h-4" />
              Pedidos ({purchases.length})
            </TabsTrigger>
            <TabsTrigger value="used" className="gap-2">
              <History className="w-4 h-4" />
              Usados ({usedItems.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {filteredInventory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Package className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg">Nenhum item no inventário</p>
                <p className="text-sm">Compre itens no Marketplace!</p>
                <Button className="mt-4 btn-mystic" onClick={() => navigate('/marketplace')}>
                  Ir para o Marketplace
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredInventory.map(item => renderItemCard(item))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="orders">
            {purchases.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <ShoppingCart className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg">Nenhum pedido</p>
                <p className="text-sm">Seus pedidos aparecerão aqui</p>
              </div>
            ) : (
              <div className="space-y-3">
                {purchases.map(purchase => {
                  const statusInfo = ORDER_STATUSES.find(s => s.value === purchase.status) || ORDER_STATUSES[0];
                  return (
                    <Card key={purchase.id} className="bg-card border-border">
                      <div className="flex items-center gap-4 p-4">
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                          {purchase.product_image ? (
                            <img src={purchase.product_image} alt={purchase.product_name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-8 h-8 text-muted-foreground/50" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate">{purchase.product_name}</h3>
                          <p className="text-sm text-muted-foreground">
                            Quantidade: {purchase.quantity} | Total: <span className="flex items-center gap-1 inline-flex"><Coins className="w-3 h-3" />{purchase.total_price}</span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(purchase.created_at).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge className={`${statusInfo.color} text-white flex items-center gap-1`}>
                            {purchase.status === 'pending' && <Clock className="w-3 h-3" />}
                            {purchase.status === 'preparing' && <Package className="w-3 h-3" />}
                            {purchase.status === 'shipping' && <Truck className="w-3 h-3" />}
                            {purchase.status === 'delivered' && <CheckCircle className="w-3 h-3" />}
                            {purchase.status === 'cancelled' && <X className="w-3 h-3" />}
                            {statusInfo.label}
                          </Badge>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="used">
            {filteredUsedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <History className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg">Nenhum item usado</p>
                <p className="text-sm">Itens usados aparecerão aqui</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredUsedItems.map(item => renderItemCard(item, false))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Transfer Dialog */}
        <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Transferir Item</DialogTitle>
              <DialogDescription>
                Envie este item para outro jogador
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {selectedItem && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                  {selectedItem.product?.image_url ? (
                    <img src={selectedItem.product.image_url} alt={selectedItem.product.name} className="w-12 h-12 rounded object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded bg-card flex items-center justify-center">
                      <Package className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{selectedItem.product?.name}</p>
                    {selectedItem.quantity > 1 && (
                      <p className="text-sm text-muted-foreground">Quantidade: {selectedItem.quantity}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="recipient">Nome de usuário do destinatário</Label>
                <Input
                  id="recipient"
                  placeholder="Digite o nome de usuário"
                  value={recipientUsername}
                  onChange={(e) => setRecipientUsername(e.target.value)}
                />
              </div>

              <p className="text-sm text-muted-foreground">
                O item será transferido e você não poderá recuperá-lo.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                className="btn-mystic" 
                onClick={handleTransfer}
                disabled={transferring || !recipientUsername.trim()}
              >
                {transferring ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Transferir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cosmetic Item Description Dialog */}
        <Dialog open={showCosmeticDescription} onOpenChange={setShowCosmeticDescription}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" />
                {cosmeticItemName}
              </DialogTitle>
            </DialogHeader>

            <div className="py-4">
              <div className="bg-muted p-4 rounded-lg">
                <div 
                  className="prose prose-invert max-w-none text-sm"
                  dangerouslySetInnerHTML={{ __html: cosmeticDescription }}
                />
              </div>
            </div>

            <DialogFooter>
              <Button 
                className="btn-mystic w-full" 
                onClick={handleConfirmCosmeticUse}
                disabled={usingItem}
              >
                {usingItem ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                Confirmar Uso
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
