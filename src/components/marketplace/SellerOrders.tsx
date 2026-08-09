/**
 * DuelVerse - Pedidos recebidos (Vendedor PRO)
 * Lista os pedidos dos produtos do vendedor e permite atualizar status/rastreio.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Package, Truck, User } from "lucide-react";

interface SellerOrder {
  id: string;
  product_name: string;
  product_image_url: string | null;
  is_physical: boolean;
  buyer_username: string | null;
  quantity: number;
  total_price: number;
  status: string;
  tracking_code: string | null;
  created_at: string;
  shipping_phone: string | null;
  shipping_zip: string | null;
  shipping_address: string | null;
  shipping_number: string | null;
  shipping_complement: string | null;
  shipping_district: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pendente" },
  { value: "processing", label: "Em preparação" },
  { value: "shipped", label: "Enviado" },
  { value: "delivered", label: "Entregue" },
  { value: "completed", label: "Concluído" },
  { value: "cancelled", label: "Cancelado" },
];

const statusClass: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-500",
  processing: "bg-blue-500/20 text-blue-400",
  shipped: "bg-purple-500/20 text-purple-400",
  delivered: "bg-green-500/20 text-green-500",
  completed: "bg-green-500/20 text-green-500",
  cancelled: "bg-destructive/20 text-destructive",
};

export function SellerOrders() {
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { status: string; tracking: string }>>({});
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("seller_marketplace_orders");
    if (error) {
      toast({ title: "Erro", description: "Não foi possível carregar os pedidos.", variant: "destructive" });
    } else {
      const rows = (data as SellerOrder[]) || [];
      setOrders(rows);
      setDrafts(
        Object.fromEntries(rows.map((o) => [o.id, { status: o.status, tracking: o.tracking_code || "" }]))
      );
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const save = async (order: SellerOrder) => {
    const draft = drafts[order.id];
    if (!draft) return;
    setSavingId(order.id);
    try {
      const { data, error } = await (supabase.rpc as any)("seller_update_order_status", {
        p_purchase_id: order.id,
        p_status: draft.status,
        p_tracking_code: draft.tracking || null,
      });
      if (error) throw error;
      const result = data as { success?: boolean; message?: string } | null;
      if (!result?.success) throw new Error(result?.message || "Falha ao atualizar");
      toast({ title: "Pedido atualizado" });
      load();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Package className="w-14 h-14 mb-3 opacity-30" />
        <p>Você ainda não recebeu pedidos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <Card key={order.id} className="border-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex gap-4 items-start">
              {order.product_image_url ? (
                <img src={order.product_image_url} alt={order.product_name} className="w-16 h-16 rounded object-cover" />
              ) : (
                <div className="w-16 h-16 rounded bg-muted flex items-center justify-center">
                  <Package className="w-7 h-7 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold">{order.product_name}</p>
                  <Badge className={`${statusClass[order.status] || "bg-muted text-muted-foreground"} border-0`}>
                    {STATUS_OPTIONS.find((s) => s.value === order.status)?.label || order.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {order.buyer_username || "Comprador"} · {order.quantity}x · {order.total_price} DuelCoins
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(order.created_at).toLocaleString("pt-BR")}
                </p>
                {order.is_physical && order.shipping_address && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1">
                    <Truck className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>
                      {order.shipping_address}, {order.shipping_number}
                      {order.shipping_complement ? ` (${order.shipping_complement})` : ""} — {order.shipping_district}, {order.shipping_city}/{order.shipping_state} · CEP {order.shipping_zip}
                      {order.shipping_phone ? ` · Tel: ${order.shipping_phone}` : ""}
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Select
                value={drafts[order.id]?.status}
                onValueChange={(v) => setDrafts((p) => ({ ...p, [order.id]: { ...p[order.id], status: v } }))}
              >
                <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {order.is_physical && (
                <Input
                  placeholder="Código de rastreio"
                  value={drafts[order.id]?.tracking || ""}
                  onChange={(e) => setDrafts((p) => ({ ...p, [order.id]: { ...p[order.id], tracking: e.target.value } }))}
                  className="sm:flex-1"
                />
              )}

              <Button onClick={() => save(order)} disabled={savingId === order.id} className="btn-mystic text-white">
                {savingId === order.id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
