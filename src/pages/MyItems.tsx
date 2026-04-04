/**
 * DuelVerse - Meus Itens
 * Desenvolvido por Vinícius
 * 
 * Página para visualizar, transferir e usar itens do inventário.
 * Inclui sistema de equipar playmats e mangas de cartas (itens digitais).
 */
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Package, Gift, Send, Zap, Loader2, History, ShoppingCart, Clock, Truck, CheckCircle, X, Coins, Sparkles, Image, Layers, PlusCircle, Upload } from "lucide-react";
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
  const { isAdmin } = useAdmin();
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
  const [activePlaymatId, setActivePlaymatId] = useState<string | null>(null);
  const [activeSleeveId, setActiveSleeveId] = useState<string | null>(null);
  // Admin create item state
  const [createItemDialogOpen, setCreateItemDialogOpen] = useState(false);
  const [creatingItem, setCreatingItem] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newItem, setNewItem] = useState({
    name: "",
    description: "",
    category: "digital_item",
    image_url: "",
    item_type: "" as string,
  });
  const { toast } = useToast();
  useEffect(() => {
    // Load equipped items from localStorage
    setActivePlaymatId(localStorage.getItem('activePlaymatId'));
    setActiveSleeveId(localStorage.getItem('activeSleeveId'));
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
    const { data, error } = await (supabase
      .from("user_inventory" as any)
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
      .order("created_at", { ascending: false }));

    if (!error && data) {
      const allItems = data as unknown as InventoryItem[];
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

      const { data, error } = await supabase.rpc("transfer_inventory_item" as any, {
        p_inventory_id: selectedItem.id,
        p_recipient_id: recipientData.user_id,
      });

      if (error) throw error;

      const result = data as { success: boolean; message: string };
      if (result.success) {
        toast({ title: "Sucesso! ✅", description: result.message });

        // Send notification to recipient
        const { data: senderProfile } = await supabase
          .from('profiles')
          .select('username')
          .eq('user_id', user?.id)
          .single();
        
        const senderName = senderProfile?.username || 'Alguém';
        const itemName = selectedItem.product?.name || 'um item';
        
        await supabase.rpc('create_notification', {
          p_user_id: recipientData.user_id,
          p_type: 'item_transfer',
          p_title: '🎁 Item Recebido!',
          p_message: `${senderName} enviou "${itemName}" para você!`,
          p_data: { type: 'item_transfer', url: '/my-items', item_name: itemName, sender: senderName },
        });

        setTransferDialogOpen(false);
        setSelectedItem(null);
        setRecipientUsername("");
        if (user) fetchInventory(user.id);
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
    if (item.product?.description) {
      setCosmeticItemName(item.product.name || "Item");
      setCosmeticDescription(item.product.description);
      setPendingCosmeticItem(item);
      setShowCosmeticDescription(true);
    } else {
      await processUseItem(item);
    }
  };

  const processUseItem = async (item: InventoryItem) => {
    setUsingItem(true);
    try {
      const { data, error } = await supabase.rpc("use_inventory_item" as any, {
        p_inventory_id: item.id,
      });

      if (error) throw error;

      const result = data as { success: boolean; message: string };
      if (result.success) {
        toast({ title: "Sucesso! ✅", description: result.message });
        if (user) fetchInventory(user.id);
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

  // Equip/Unequip playmat
  const handleEquipPlaymat = (item: InventoryItem) => {
    if (activePlaymatId === item.id) {
      // Unequip
      localStorage.removeItem('activePlaymatUrl');
      localStorage.removeItem('activePlaymatId');
      setActivePlaymatId(null);
      toast({ title: "Playmat removido", description: "O playmat foi desequipado da arena." });
    } else {
      // Equip
      if (item.product?.image_url) {
        localStorage.setItem('activePlaymatUrl', item.product.image_url);
        localStorage.setItem('activePlaymatId', item.id);
        setActivePlaymatId(item.id);
        toast({ title: "Playmat equipado! 🎨", description: `"${item.product?.name}" está ativo na arena.` });
      }
    }
  };

  // Equip/Unequip card sleeve
  const handleEquipSleeve = (item: InventoryItem) => {
    if (activeSleeveId === item.id) {
      localStorage.removeItem('activeSleeveUrl');
      localStorage.removeItem('activeSleeveId');
      setActiveSleeveId(null);
      toast({ title: "Sleeve removida", description: "A sleeve foi desequipada." });
    } else {
      if (item.product?.image_url) {
        localStorage.setItem('activeSleeveUrl', item.product.image_url);
        localStorage.setItem('activeSleeveId', item.id);
        setActiveSleeveId(item.id);
        toast({ title: "Sleeve equipada! 🃏", description: `"${item.product?.name}" está ativa.` });
      }
    }
  };

  const isPlaymatItem = (item: InventoryItem) => {
    const name = item.product?.name?.toLowerCase() || '';
    const meta = item.product?.metadata as Record<string, unknown> | undefined;
    return meta?.type === 'playmat' || name.includes('playmat') || name.includes('tapete');
  };

  const isSleeveItem = (item: InventoryItem) => {
    const name = item.product?.name?.toLowerCase() || '';
    const meta = item.product?.metadata as Record<string, unknown> | undefined;
    return meta?.type === 'sleeve' || name.includes('manga') || name.includes('sleeve');
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

  // Digital items that are playmats or sleeves (from active inventory)
  const digitalEquipItems = inventory.filter(item =>
    item.product?.category === 'digital_item' && (isPlaymatItem(item) || isSleeveItem(item))
  );

  const renderItemCard = (item: InventoryItem, showActions: boolean = true) => {
    const catInfo = item.product?.category ? categoryLabels[item.product.category] : categoryLabels.digital_item;

    return (
      <Card key={item.id} className="bg-card border-border hover:border-primary/30 transition-all duration-300">
        <div className="flex gap-4 p-4">
          <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0">
            {item.product?.image_url ? (
              <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-8 h-8 text-muted-foreground/50" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold truncate">{item.product?.name || "Item Desconhecido"}</h3>
                {item.product?.description && item.is_used && (
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
                {item.product?.category === 'cosmetic' && (
                  <Button
                    size="sm"
                    className="btn-mystic flex-1"
                    onClick={() => handleUseItem(item)}
                    disabled={usingItem}
                  >
                    <Zap className="w-4 h-4 mr-1" />
                    Usar
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  };

  const renderEquipCard = (item: InventoryItem) => {
    const isPlaymat = isPlaymatItem(item);
    const isSleeve = isSleeveItem(item);
    const isEquipped = isPlaymat 
      ? activePlaymatId === item.id 
      : activeSleeveId === item.id;

    return (
      <Card key={item.id} className={`bg-card border-border hover:border-primary/30 transition-all duration-300 ${isEquipped ? 'ring-2 ring-primary border-primary' : ''}`}>
        <div className="flex gap-4 p-4">
          <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
            {item.product?.image_url ? (
              <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                {isPlaymat ? <Image className="w-8 h-8 text-muted-foreground/50" /> : <Layers className="w-8 h-8 text-muted-foreground/50" />}
              </div>
            )}
            {isEquipped && (
              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                <Badge className="bg-primary text-primary-foreground text-[10px]">Equipado</Badge>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{item.product?.name || "Item"}</h3>
            <Badge className="mt-1 text-xs bg-primary/20 text-primary border-0">
              {isPlaymat ? '🎨 Playmat' : '🃏 Sleeve'}
            </Badge>

            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                className={isEquipped ? "flex-1" : "btn-mystic flex-1"}
                variant={isEquipped ? "outline" : "default"}
                onClick={() => isPlaymat ? handleEquipPlaymat(item) : handleEquipSleeve(item)}
              >
                {isEquipped ? 'Desequipar' : 'Equipar'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openTransferDialog(item)}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  // Admin: handle image upload for create item
  const handleAdminImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast({ title: 'Erro', description: 'Selecione uma imagem', variant: 'destructive' }); return; }
    if (file.size > 5 * 1024 * 1024) { toast({ title: 'Erro', description: 'Máximo 5MB', variant: 'destructive' }); return; }
    setUploadingImage(true);
    try {
      const reader = new FileReader();
      reader.onload = (event) => setImagePreview(event.target?.result as string);
      reader.readAsDataURL(file);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const filePath = `marketplace/${user?.id || 'admin'}/${fileName}`;
      const { error } = await supabase.storage.from('marketplace-images').upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('marketplace-images').getPublicUrl(filePath);
      setNewItem(prev => ({ ...prev, image_url: publicUrl }));
      toast({ title: 'Imagem carregada!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally { setUploadingImage(false); }
  };

  const handleCreatePersonalItem = async () => {
    if (!newItem.name.trim()) {
      toast({ title: "Erro", description: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    setCreatingItem(true);
    try {
      const metadata: any = {};
      if (newItem.category === 'digital_item' && newItem.item_type) {
        metadata.item_type = newItem.item_type;
      }

      // Create product (not visible in marketplace)
      const { data: product, error: productError } = await supabase
        .from('marketplace_products')
        .insert({
          name: newItem.name,
          description: newItem.description || null,
          price_duelcoins: 0,
          category: newItem.category,
          product_type: 'one_time',
          image_url: newItem.image_url || null,
          seller_id: user?.id,
          is_third_party_seller: false,
          is_active: false, // Not visible in marketplace
          is_approved: true,
          metadata,
        })
        .select()
        .single();

      if (productError) throw productError;

      // Add directly to admin's inventory
      const { error: inventoryError } = await supabase
        .from('user_inventory' as any)
        .insert({
          user_id: user?.id,
          product_id: product.id,
          quantity: 1,
          is_used: false,
        });

      if (inventoryError) throw inventoryError;

      toast({ title: "Item criado! ✅", description: `"${newItem.name}" foi adicionado ao seu inventário.` });
      setCreateItemDialogOpen(false);
      setNewItem({ name: "", description: "", category: "digital_item", image_url: "", item_type: "" });
      setImagePreview(null);
      if (user) fetchInventory(user.id);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setCreatingItem(false);
    }
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
              <Gift className="w-6 h-6 sm:w-8 sm:h-8 text-primary flex-shrink-0" />
              <h1 className="text-2xl sm:text-4xl font-bold text-gradient-mystic">Meus Itens</h1>
            </div>
            <p className="text-sm sm:text-base text-muted-foreground">
              Gerencie seus itens comprados no Marketplace
            </p>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            {isAdmin && (
              <Button className="btn-mystic flex-1 sm:flex-none text-xs sm:text-sm h-10 sm:h-11" onClick={() => setCreateItemDialogOpen(true)}>
                <PlusCircle className="w-4 h-4 mr-1 sm:mr-2" />
                Criar Meu Item
              </Button>
            )}
            <Button variant="outline" className="flex-1 sm:flex-none text-xs sm:text-sm h-10 sm:h-11" onClick={() => navigate('/marketplace')}>
              <Package className="w-4 h-4 mr-1 sm:mr-2" />
              Marketplace
            </Button>
          </div>
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
          <div className="overflow-x-auto -mx-4 px-4 mb-6">
            <TabsList className="flex-nowrap w-max sm:w-full">
              <TabsTrigger value="active" className="gap-1 sm:gap-2 text-xs sm:text-sm whitespace-nowrap">
                <Package className="w-3 h-3 sm:w-4 sm:h-4" />
                Ativos ({inventory.length})
              </TabsTrigger>
              <TabsTrigger value="equip" className="gap-1 sm:gap-2 text-xs sm:text-sm whitespace-nowrap">
                <Image className="w-3 h-3 sm:w-4 sm:h-4" />
                Equip. ({digitalEquipItems.length})
              </TabsTrigger>
              <TabsTrigger value="orders" className="gap-1 sm:gap-2 text-xs sm:text-sm whitespace-nowrap">
                <ShoppingCart className="w-3 h-3 sm:w-4 sm:h-4" />
                Pedidos ({purchases.length})
              </TabsTrigger>
              <TabsTrigger value="used" className="gap-1 sm:gap-2 text-xs sm:text-sm whitespace-nowrap">
                <History className="w-3 h-3 sm:w-4 sm:h-4" />
                Usados ({usedItems.length})
              </TabsTrigger>
            </TabsList>
          </div>
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

          <TabsContent value="equip">
            {digitalEquipItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Image className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg">Nenhum equipamento disponível</p>
                <p className="text-sm">Compre playmats e sleeves no Marketplace!</p>
                <Button className="mt-4 btn-mystic" onClick={() => navigate('/marketplace')}>
                  Ir para o Marketplace
                </Button>
              </div>
            ) : (
              <>
                {/* Playmats Section */}
                {digitalEquipItems.filter(isPlaymatItem).length > 0 && (
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Image className="w-5 h-5 text-primary" />
                      Playmats (Tapetes de Campo)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {digitalEquipItems.filter(isPlaymatItem).map(renderEquipCard)}
                    </div>
                  </div>
                )}

                {/* Sleeves Section */}
                {digitalEquipItems.filter(isSleeveItem).length > 0 && (
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Layers className="w-5 h-5 text-primary" />
                      Sleeves
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {digitalEquipItems.filter(isSleeveItem).map(renderEquipCard)}
                    </div>
                  </div>
                )}

                {/* Items that are digital but not playmat/sleeve */}
                {digitalEquipItems.filter(i => !isPlaymatItem(i) && !isSleeveItem(i)).length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Outros Itens Digitais</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {digitalEquipItems.filter(i => !isPlaymatItem(i) && !isSleeveItem(i)).map(renderEquipCard)}
                    </div>
                  </div>
                )}
              </>
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
        {/* Admin Create Item Dialog */}
        <Dialog open={createItemDialogOpen} onOpenChange={setCreateItemDialogOpen}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-primary" />
                Criar Meu Item
              </DialogTitle>
              <DialogDescription>
                Crie um item que irá direto para o seu inventário
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nome do Item *</Label>
                <Input
                  placeholder="Ex: Playmat Dragon Shield"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  placeholder="Descrição do item..."
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={newItem.category} onValueChange={(v) => setNewItem({ ...newItem, category: v, item_type: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="digital_item">Item Digital</SelectItem>
                    <SelectItem value="cosmetic">Cosmético</SelectItem>
                    <SelectItem value="service">Serviço</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newItem.category === 'digital_item' && (
                <div className="space-y-2">
                  <Label>Tipo do Item</Label>
                  <Select value={newItem.item_type} onValueChange={(v) => setNewItem({ ...newItem, item_type: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="playmat">Playmat</SelectItem>
                      <SelectItem value="sleeve">Sleeve</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Imagem</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAdminImageChange}
                />
                {imagePreview ? (
                  <div className="relative">
                    <img src={imagePreview} alt="Preview" className="w-full h-40 object-cover rounded-lg" />
                    <Button
                      size="sm"
                      variant="destructive"
                      className="absolute top-2 right-2"
                      onClick={() => { setImagePreview(null); setNewItem({ ...newItem, image_url: '' }); }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                  >
                    {uploadingImage ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    {uploadingImage ? 'Enviando...' : 'Carregar Imagem'}
                  </Button>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateItemDialogOpen(false)}>Cancelar</Button>
              <Button className="btn-mystic" onClick={handleCreatePersonalItem} disabled={creatingItem || !newItem.name.trim()}>
                {creatingItem ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlusCircle className="w-4 h-4 mr-2" />}
                Criar Item
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
