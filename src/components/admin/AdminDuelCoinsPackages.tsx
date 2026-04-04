import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Coins, Plus, Pencil, Trash2, Package, ExternalLink, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface DuelCoinsPackage {
  id: string;
  name: string;
  description: string | null;
  duelcoins_amount: number;
  price_brl: number;
  checkout_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  image_url: string | null;
  sort_order: number;
}

const emptyForm = {
  name: '',
  description: '',
  duelcoins_amount: '',
  price_brl: '',
  checkout_url: '',
  is_active: true,
  is_featured: false,
  image_url: '',
  sort_order: '0',
};

export const AdminDuelCoinsPackages = () => {
  const [packages, setPackages] = useState<DuelCoinsPackage[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchPackages();
    fetchOrders();
  }, []);

  const fetchPackages = async () => {
    const { data } = await supabase
      .from('duelcoins_packages')
      .select('*')
      .order('sort_order', { ascending: true });
    setPackages((data as any[]) || []);
  };

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('duelcoins_orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) {
      const ordersWithUsers = await Promise.all(
        data.map(async (order: any) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('user_id', order.user_id)
            .maybeSingle();
          return { ...order, username: profile?.username || 'Desconhecido' };
        })
      );
      setOrders(ordersWithUsers);
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.duelcoins_amount || !form.price_brl) {
      toast({ title: "Preencha nome, quantidade e preço", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        duelcoins_amount: parseInt(form.duelcoins_amount),
        price_brl: parseFloat(form.price_brl),
        checkout_url: form.checkout_url || null,
        is_active: form.is_active,
        is_featured: form.is_featured,
        image_url: form.image_url || null,
        sort_order: parseInt(form.sort_order) || 0,
      };

      if (editingId) {
        const { error } = await supabase
          .from('duelcoins_packages')
          .update(payload as any)
          .eq('id', editingId);
        if (error) throw error;
        toast({ title: "Pacote atualizado!" });
      } else {
        const { error } = await supabase
          .from('duelcoins_packages')
          .insert(payload as any);
        if (error) throw error;
        toast({ title: "Pacote criado!" });
      }

      setForm(emptyForm);
      setEditingId(null);
      setDialogOpen(false);
      fetchPackages();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (pkg: DuelCoinsPackage) => {
    setForm({
      name: pkg.name,
      description: pkg.description || '',
      duelcoins_amount: String(pkg.duelcoins_amount),
      price_brl: String(pkg.price_brl),
      checkout_url: pkg.checkout_url || '',
      is_active: pkg.is_active,
      is_featured: pkg.is_featured,
      image_url: pkg.image_url || '',
      sort_order: String(pkg.sort_order),
    });
    setEditingId(pkg.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este pacote?")) return;
    const { error } = await supabase.from('duelcoins_packages').delete().eq('id', id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Pacote excluído" });
      fetchPackages();
    }
  };

  const handleApproveOrder = async (order: any) => {
    if (!confirm(`Aprovar pedido de ${order.duelcoins_amount} DuelCoins para ${order.username}?`)) return;
    
    try {
      const { error: rpcError } = await supabase.rpc('admin_manage_duelcoins', {
        p_user_id: order.user_id,
        p_amount: order.duelcoins_amount,
        p_operation: 'add',
        p_reason: `Compra aprovada manualmente - Pedido #${order.id.slice(0, 8)}`,
      });
      if (rpcError) throw rpcError;

      const { error } = await supabase
        .from('duelcoins_orders')
        .update({ status: 'paid', paid_at: new Date().toISOString() } as any)
        .eq('id', order.id);
      if (error) throw error;

      toast({ title: "Pedido aprovado e DuelCoins creditados!" });
      fetchOrders();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Packages Management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Pacotes de DuelCoins
            </CardTitle>
            <CardDescription>Gerencie os pacotes disponíveis para compra</CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) { setForm(emptyForm); setEditingId(null); }
          }}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> Novo Pacote</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingId ? 'Editar Pacote' : 'Novo Pacote'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: 500 DuelCoins" />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descrição opcional" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Quantidade de DuelCoins</Label>
                    <Input type="number" value={form.duelcoins_amount} onChange={(e) => setForm({ ...form, duelcoins_amount: e.target.value })} />
                  </div>
                  <div>
                    <Label>Preço (R$)</Label>
                    <Input type="number" step="0.01" value={form.price_brl} onChange={(e) => setForm({ ...form, price_brl: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>URL de Checkout (AbacatePay)</Label>
                  <Input value={form.checkout_url} onChange={(e) => setForm({ ...form, checkout_url: e.target.value })} placeholder="https://abacatepay.com/..." />
                </div>
                <div>
                  <Label>URL da Imagem (opcional)</Label>
                  <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." />
                </div>
                <div>
                  <Label>Ordem de exibição</Label>
                  <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
                </div>
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                    <Label>Ativo</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.is_featured} onCheckedChange={(v) => setForm({ ...form, is_featured: v })} />
                    <Label>Destaque</Label>
                  </div>
                </div>
                <Button onClick={handleSave} disabled={loading} className="w-full">
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {editingId ? 'Atualizar' : 'Criar Pacote'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {packages.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum pacote criado ainda</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>DuelCoins</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packages.map((pkg) => (
                    <TableRow key={pkg.id}>
                      <TableCell className="font-medium">
                        {pkg.name}
                        {pkg.is_featured && <Badge className="ml-2 bg-primary">Destaque</Badge>}
                      </TableCell>
                      <TableCell className="text-yellow-500 font-bold">
                        {pkg.duelcoins_amount} <Coins className="w-3 h-3 inline" />
                      </TableCell>
                      <TableCell>R$ {Number(pkg.price_brl).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={pkg.is_active ? "default" : "secondary"}>
                          {pkg.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => handleEdit(pkg)}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(pkg.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Orders */}
      <Card>
        <CardHeader>
          <CardTitle>Pedidos Recentes</CardTitle>
          <CardDescription>Últimos 50 pedidos de compra de DuelCoins</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>DuelCoins</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Nenhum pedido encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="text-xs">
                        {new Date(order.created_at).toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell>{order.username}</TableCell>
                      <TableCell className="font-bold text-yellow-500">
                        {order.duelcoins_amount} <Coins className="w-3 h-3 inline" />
                      </TableCell>
                      <TableCell>R$ {Number(order.amount_brl).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={order.status === 'paid' ? 'default' : 'outline'} className={order.status === 'paid' ? 'bg-green-500' : ''}>
                          {order.status === 'paid' ? 'Pago' : order.status === 'pending' ? 'Pendente' : order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {order.status === 'pending' && (
                          <Button size="sm" variant="outline" onClick={() => handleApproveOrder(order)}>
                            Aprovar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
