/**
 * DuelVerse - Admin Marketplace
 * Desenvolvido por Vinícius
 * 
 * Gerenciamento de produtos e pedidos do marketplace pelo admin.
 */
import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, Loader2, Package, Coins, Upload, ImageIcon, X, ShoppingCart, Truck, CheckCircle, Clock, PackageCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price_duelcoins: number;
  image_url: string | null;
  category: string;
  product_type: string;
  is_active: boolean;
  stock: number | null;
  created_at: string;
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
  username?: string;
}

const ORDER_STATUSES = [
  { value: 'pending', label: 'Pendente', color: 'bg-yellow-500' },
  { value: 'preparing', label: 'Em Preparação', color: 'bg-blue-500' },
  { value: 'shipping', label: 'A Caminho', color: 'bg-orange-500' },
  { value: 'delivered', label: 'Entregue', color: 'bg-green-500' },
  { value: 'cancelled', label: 'Cancelado', color: 'bg-red-500' },
];

const emptyForm = {
  name: "",
  description: "",
  price_duelcoins: 0,
  image_url: "",
  category: "digital_item",
  product_type: "one_time",
  is_active: true,
  stock: null as number | null,
};

export const AdminMarketplace = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchProducts();
    fetchPurchases();
  }, []);

  const fetchPurchases = async () => {
    const { data, error } = await supabase
      .from('marketplace_purchases')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      // Fetch product names and usernames
      const productIds = Array.from([...new Set(data.map((p: Purchase) => p.product_id))] as string[]);
      const userIds = Array.from([...new Set(data.map((p: Purchase) => p.user_id))] as string[]);

      const { data: productsData } = await supabase
        .from('marketplace_products')
        .select('id, name')
        .in('id', productIds);

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, username')
        .in('user_id', userIds);

      const productMap = new Map(productsData?.map(p => [p.id, p.name]) || []);
      const profileMap = new Map(profilesData?.map(p => [p.user_id, p.username]) || []);

      const purchasesWithDetails = data.map((p: Purchase) => ({
        ...p,
        product_name: productMap.get(p.product_id) || 'Produto desconhecido',
        username: profileMap.get(p.user_id) || 'Usuário desconhecido',
      }));

      setPurchases(purchasesWithDetails);
    }
    setLoading(false);
  };

  const updatePurchaseStatus = async (purchaseId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('marketplace_purchases')
        .update({ status: newStatus })
        .eq('id', purchaseId);

      if (error) throw error;

      // Notify the user about status change and handle delivery/cancellation
      const purchase = purchases.find(p => p.id === purchaseId);
      if (purchase) {
        let message = '';
        if (newStatus === 'delivered') {
          message = 'Seu pedido foi ENTREGUE! Obrigado por comprar conosco.';
        } else if (newStatus === 'cancelled') {
          message = 'Seu pedido foi CANCELADO. O valor será reembolsado em breve.';
        } else {
          const statusInfo = ORDER_STATUSES.find(s => s.value === newStatus);
          message = `Seu pedido foi atualizado para: ${statusInfo?.label || newStatus}`;
        }
        
        await supabase
          .from('notifications')
          .insert({
            user_id: purchase.user_id,
            type: 'order_status',
            title: newStatus === 'delivered' ? 'Pedido Entregue! 🎉' : newStatus === 'cancelled' ? 'Pedido Cancelado' : 'Status do Pedido Atualizado 📦',
            message: message,
            read: false,
          });

        // Also notify admin about status change
        const { data: admins } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin');

        if (admins && admins.length > 0) {
          const adminNotifications = admins.map((admin) => ({
            user_id: admin.user_id,
            type: 'order_status_admin',
            title: `Pedido ${newStatus === 'delivered' ? 'Entregue' : newStatus === 'cancelled' ? 'Cancelado' : 'Atualizado'} 📦`,
            message: `Pedido de ${purchase.username}: ${purchase.product_name} - Status: ${ORDER_STATUSES.find(s => s.value === newStatus)?.label || newStatus}`,
            read: false,
          }));

          await supabase
            .from('notifications')
            .insert(adminNotifications);
        }

        // Delete notification for admin when order is cancelled or delivered
        if (newStatus === 'cancelled' || newStatus === 'delivered') {
          // Find and delete the original purchase notification for admins
          const { data: existingNotifications } = await supabase
            .from('notifications')
            .select('id, type, message')
            .eq('type', 'marketplace_purchase')
            .ilike('message', `%${purchase.product_name}%`)
            .eq('is_read', false);

          if (existingNotifications && existingNotifications.length > 0) {
            const notificationIds = existingNotifications.map(n => n.id);
            await supabase
              .from('notifications')
              .delete()
              .in('id', notificationIds);
          }
        }
      }

      toast({ title: 'Status atualizado! ✅' });
      fetchPurchases();
    } catch (err: any) {
      toast({ title: 'Erro ao atualizar', description: err.message, variant: 'destructive' });
    }
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from("marketplace_products")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) setProducts(data);
    setLoading(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setImagePreview(null);
    setDialogOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingId(product.id);
    setForm({
      name: product.name,
      description: product.description || "",
      price_duelcoins: product.price_duelcoins,
      image_url: product.image_url || "",
      category: product.category,
      product_type: product.product_type,
      is_active: product.is_active,
      stock: product.stock,
    });
    setImagePreview(product.image_url || null);
    setDialogOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Apenas imagens são permitidas", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Imagem muito grande (máx 5MB)", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("marketplace-images")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("marketplace-images")
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;
      setForm(f => ({ ...f, image_url: publicUrl }));
      setImagePreview(publicUrl);
      toast({ title: "Imagem enviada ✅" });
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    setForm(f => ({ ...f, image_url: "" }));
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price_duelcoins: form.price_duelcoins,
        image_url: form.image_url.trim() || null,
        category: form.category,
        product_type: form.product_type,
        is_active: form.is_active,
        stock: form.stock,
      };

      if (editingId) {
        const { error } = await supabase.from("marketplace_products").update(payload).eq("id", editingId);
        if (error) throw error;
        toast({ title: "Produto atualizado ✅" });
      } else {
        const { error } = await supabase.from("marketplace_products").insert(payload);
        if (error) throw error;
        toast({ title: "Produto criado ✅" });
      }
      setDialogOpen(false);
      fetchProducts();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;
    const { error } = await supabase.from("marketplace_products").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Produto excluído" });
      fetchProducts();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="products" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Produtos
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            Pedidos ({purchases.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Package className="w-6 h-6 text-primary" />
              Marketplace ({products.length})
            </h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn-mystic" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Produto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Produto" : "Novo Produto"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome do produto" />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição do produto" />
              </div>
              <div>
                <Label>Preço (DuelCoins) *</Label>
                <Input type="number" min={0} value={form.price_duelcoins} onChange={e => setForm(f => ({ ...f, price_duelcoins: parseInt(e.target.value) || 0 }))} />
              </div>
              <div>
                <Label>Imagem do Produto</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                {imagePreview ? (
                  <div className="relative mt-2 w-full aspect-square max-w-[200px] rounded-lg overflow-hidden border border-border">
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-7 w-7"
                      onClick={removeImage}
                      type="button"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : null}
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex-1"
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    {uploading ? "Enviando..." : "Fazer Upload"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Ou cole uma URL abaixo:</p>
                <Input
                  value={form.image_url}
                  onChange={e => {
                    setForm(f => ({ ...f, image_url: e.target.value }));
                    setImagePreview(e.target.value || null);
                  }}
                  placeholder="https://..."
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="digital_item">Item Digital</SelectItem>
                    <SelectItem value="service">Serviço</SelectItem>
                    <SelectItem value="cosmetic">Cosmético</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.product_type} onValueChange={v => setForm(f => ({ ...f, product_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_time">Compra Única</SelectItem>
                    <SelectItem value="consumable">Consumível</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estoque (deixe vazio para ilimitado)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.stock ?? ""}
                  onChange={e => setForm(f => ({ ...f, stock: e.target.value === "" ? null : parseInt(e.target.value) || 0 }))}
                  placeholder="Ilimitado"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
                <Label>Ativo</Label>
              </div>
              <Button className="w-full btn-mystic" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {editingId ? "Salvar Alterações" : "Criar Produto"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum produto cadastrado
                  </TableCell>
                </TableRow>
              ) : (
                products.map(product => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {product.image_url ? (
                          <img src={product.image_url} alt="" className="w-10 h-10 rounded object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                            <Package className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{product.name}</p>
                          {product.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{product.description}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{product.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-secondary font-medium">
                        <Coins className="w-4 h-4" />
                        {product.price_duelcoins}
                      </span>
                    </TableCell>
                    <TableCell>{product.stock ?? "∞"}</TableCell>
                    <TableCell>
                      <Badge variant={product.is_active ? "default" : "secondary"}>
                        {product.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(product)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(product.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                Gerenciar Pedidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido ID</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Qtd</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        Nenhum pedido encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    purchases.map(purchase => {
                      const statusInfo = ORDER_STATUSES.find(s => s.value === purchase.status) || ORDER_STATUSES[0];
                      return (
                        <TableRow key={purchase.id}>
                          <TableCell className="font-mono text-xs">{purchase.id.slice(0, 8)}...</TableCell>
                          <TableCell>{purchase.username}</TableCell>
                          <TableCell>{purchase.product_name}</TableCell>
                          <TableCell>{purchase.quantity}</TableCell>
                          <TableCell className="flex items-center gap-1">
                            <Coins className="w-3 h-3" />
                            {purchase.total_price}
                          </TableCell>
                          <TableCell>
                            <Badge className={`${statusInfo.color} text-white`}>
                              {statusInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {new Date(purchase.created_at).toLocaleDateString('pt-BR')}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={purchase.status}
                              onValueChange={(value) => updatePurchaseStatus(purchase.id, value)}
                            >
                              <SelectTrigger className="w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ORDER_STATUSES.map(status => (
                                  <SelectItem key={status.value} value={status.value}>
                                    <div className="flex items-center gap-2">
                                      {status.value === 'pending' && <Clock className="w-3 h-3" />}
                                      {status.value === 'preparing' && <Package className="w-3 h-3" />}
                                      {status.value === 'shipping' && <Truck className="w-3 h-3" />}
                                      {status.value === 'delivered' && <CheckCircle className="w-3 h-3" />}
                                      {status.value === 'cancelled' && <X className="w-3 h-3" />}
                                      {status.label}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
