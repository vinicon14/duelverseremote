import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Ticket, Plus, Trash2, Loader2, Pencil } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_percent: number;
  max_uses: number | null;
  times_used: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

const emptyForm = {
  code: '',
  description: '',
  discount_percent: '10',
  max_uses: '',
  expires_at: '',
  is_active: true,
};

export const AdminCoupons = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => { fetchCoupons(); }, []);

  const fetchCoupons = async () => {
    const { data } = await supabase
      .from('discount_coupons')
      .select('*')
      .order('created_at', { ascending: false });
    setCoupons((data as any) || []);
  };

  const resetForm = () => { setForm(emptyForm); setEditingId(null); };

  const openEdit = (c: Coupon) => {
    setEditingId(c.id);
    setForm({
      code: c.code,
      description: c.description || '',
      discount_percent: String(c.discount_percent),
      max_uses: c.max_uses != null ? String(c.max_uses) : '',
      expires_at: c.expires_at ? c.expires_at.slice(0, 16) : '',
      is_active: c.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const code = form.code.trim().toUpperCase();
    const pct = parseInt(form.discount_percent);
    if (!code || isNaN(pct) || pct < 1 || pct > 100) {
      toast({ title: "Dados inválidos", description: "Código e desconto (1-100) são obrigatórios.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const payload: any = {
      code,
      description: form.description.trim() || null,
      discount_percent: pct,
      max_uses: form.max_uses ? parseInt(form.max_uses) : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      is_active: form.is_active,
    };
    let error;
    if (editingId) {
      ({ error } = await supabase.from('discount_coupons').update(payload).eq('id', editingId));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      payload.created_by = user?.id;
      ({ error } = await supabase.from('discount_coupons').insert(payload));
    }
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingId ? "Cupom atualizado" : "Cupom criado" });
      setDialogOpen(false);
      resetForm();
      fetchCoupons();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este cupom?')) return;
    const { error } = await supabase.from('discount_coupons').delete().eq('id', id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Cupom excluído" }); fetchCoupons(); }
  };

  const toggleActive = async (c: Coupon) => {
    const { error } = await supabase.from('discount_coupons').update({ is_active: !c.is_active }).eq('id', c.id);
    if (!error) fetchCoupons();
  };

  return (
    <Card className="card-mystic">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><Ticket className="w-5 h-5 text-primary" /> Cupons de Desconto</CardTitle>
          <CardDescription>Crie e gerencie cupons aplicáveis na compra de DuelCoins.</CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Novo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Cupom' : 'Novo Cupom'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Código</Label>
                <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="EX: BEMVINDO10" />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Opcional" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Desconto (%)</Label>
                  <Input type="number" min={1} max={100} value={form.discount_percent} onChange={e => setForm({ ...form, discount_percent: e.target.value })} />
                </div>
                <div>
                  <Label>Usos máximos</Label>
                  <Input type="number" min={1} value={form.max_uses} onChange={e => setForm({ ...form, max_uses: e.target.value })} placeholder="Ilimitado" />
                </div>
              </div>
              <div>
                <Label>Expira em</Label>
                <Input type="datetime-local" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Ativo</Label>
              </div>
              <Button onClick={handleSave} disabled={loading} className="w-full">
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Desconto</TableHead>
                <TableHead>Usos</TableHead>
                <TableHead>Expira</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhum cupom criado.</TableCell></TableRow>
              )}
              {coupons.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-bold">{c.code}</TableCell>
                  <TableCell><Badge className="bg-amber-500 text-black">{c.discount_percent}%</Badge></TableCell>
                  <TableCell>{c.times_used}{c.max_uses != null ? ` / ${c.max_uses}` : ''}</TableCell>
                  <TableCell className="text-xs">{c.expires_at ? new Date(c.expires_at).toLocaleString('pt-BR') : '—'}</TableCell>
                  <TableCell>
                    <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} />
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
