/**
 * DuelVerse - Painel Admin: Cupons de Desconto
 * Gestão de cupons aplicáveis no Marketplace.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Ticket, Loader2 } from "lucide-react";

interface Coupon {
  id: string;
  code: string;
  discount_percent: number;
  expires_at: string | null;
  max_uses: number | null;
  times_used: number;
  is_active: boolean;
  description: string | null;
  created_at: string;
}

const emptyForm = {
  code: "",
  discount_percent: 10,
  expires_at: "",
  max_uses: "" as string | "",
  description: "",
  is_active: true,
};

export const AdminCoupons = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("discount_coupons")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
    setCoupons((data as Coupon[]) || []);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  };

  const openEdit = (c: Coupon) => {
    setEditing(c);
    setForm({
      code: c.code,
      discount_percent: c.discount_percent,
      expires_at: c.expires_at ? c.expires_at.slice(0, 16) : "",
      max_uses: c.max_uses?.toString() ?? "",
      description: c.description ?? "",
      is_active: c.is_active,
    });
    setOpen(true);
  };

  const validateForm = (): string | null => {
    const code = form.code.trim().toUpperCase();
    if (!code) return "Código é obrigatório";
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return "Código deve ter 3-32 caracteres (letras, números, _ ou -)";
    const pct = Number(form.discount_percent);
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) return "Desconto deve ser inteiro entre 1 e 100";
    if (form.max_uses !== "") {
      const mu = Number(form.max_uses);
      if (!Number.isInteger(mu) || mu < 1) return "Limite de usos deve ser inteiro positivo";
    }
    if (form.expires_at) {
      const d = new Date(form.expires_at);
      if (isNaN(d.getTime())) return "Data de expiração inválida";
    }
    return null;
  };

  const handleSave = async () => {
    const err = validateForm();
    if (err) {
      toast({ title: "Validação", description: err, variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload: any = {
      code: form.code.trim().toUpperCase(),
      discount_percent: Number(form.discount_percent),
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      max_uses: form.max_uses === "" ? null : Number(form.max_uses),
      description: form.description.trim() || null,
      is_active: form.is_active,
    };

    let error;
    if (editing) {
      ({ error } = await (supabase as any)
        .from("discount_coupons")
        .update(payload)
        .eq("id", editing.id));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      payload.created_by = user?.id;
      ({ error } = await (supabase as any).from("discount_coupons").insert(payload));
    }

    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Cupom atualizado" : "Cupom criado" });
    setOpen(false);
    fetchCoupons();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Apagar este cupom?")) return;
    const { error } = await (supabase as any).from("discount_coupons").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Cupom apagado" });
    fetchCoupons();
  };

  const toggleActive = async (c: Coupon) => {
    const { error } = await (supabase as any)
      .from("discount_coupons")
      .update({ is_active: !c.is_active })
      .eq("id", c.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    fetchCoupons();
  };

  const formatExpiry = (iso: string | null) => {
    if (!iso) return "Sem expiração";
    const d = new Date(iso);
    const expired = d < new Date();
    return `${d.toLocaleString()} ${expired ? "(expirado)" : ""}`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Ticket className="w-5 h-5" />
          Cupons de Desconto (Marketplace)
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Cupom
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Cupom" : "Novo Cupom"}</DialogTitle>
              <DialogDescription>
                Cupons aplicam desconto percentual em compras do marketplace.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>Código</Label>
                <Input
                  placeholder="EX: WELCOME20"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  maxLength={32}
                />
              </div>
              <div>
                <Label>Desconto (%)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.discount_percent}
                  onChange={(e) => setForm({ ...form, discount_percent: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Expira em (opcional)</Label>
                <Input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                />
              </div>
              <div>
                <Label>Limite de usos (opcional)</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="Ilimitado"
                  value={form.max_uses}
                  onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                />
              </div>
              <div>
                <Label>Descrição (opcional)</Label>
                <Input
                  maxLength={200}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Ativo</Label>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editing ? "Salvar alterações" : "Criar cupom"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : coupons.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum cupom criado. Clique em "Novo Cupom" para começar.
          </p>
        ) : (
          <div className="space-y-3">
            {coupons.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3 border rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold">{c.code}</span>
                    <Badge variant="secondary">{c.discount_percent}% OFF</Badge>
                    {!c.is_active && <Badge variant="destructive">Inativo</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Expira: {formatExpiry(c.expires_at)} • Usos:{" "}
                    {c.times_used}
                    {c.max_uses ? ` / ${c.max_uses}` : ""}
                  </p>
                  {c.description && (
                    <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} />
                  <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
