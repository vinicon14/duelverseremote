/**
 * DuelVerse - Meus Pedidos
 * Acompanhamento em tempo real dos pedidos do marketplace (estilo rastreamento).
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Package, Loader2, Copy, Truck, StickyNote, Coins } from "lucide-react";
import {
  ORDER_TIMELINE,
  getOrderStatusInfo,
  normalizeOrderStatus,
  type OrderStatusHistoryEntry,
} from "@/utils/orderStatus";

interface OrderRow {
  id: string;
  product_id: string;
  quantity: number;
  total_price: number;
  status: string;
  created_at: string;
  tracking_code: string | null;
  admin_notes: string | null;
  status_history: OrderStatusHistoryEntry[] | null;
  product_name?: string;
  product_image?: string | null;
  product_category?: string;
}

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";

export const MyOrders = ({ userId }: { userId: string | null }) => {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchOrders = useCallback(async () => {
    if (!userId) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("marketplace_purchases")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar pedidos:", error);
      setLoading(false);
      return;
    }

    const rows = (data || []) as unknown as OrderRow[];
    const productIds = [...new Set(rows.map((r) => r.product_id))];

    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from("marketplace_products")
        .select("id, name, image_url, category")
        .in("id", productIds);

      const map = new Map((products || []).map((p) => [p.id, p]));
      rows.forEach((row) => {
        const product = map.get(row.product_id);
        row.product_name = product?.name || "Produto removido";
        row.product_image = product?.image_url ?? null;
        row.product_category = product?.category;
      });
    }

    setOrders(rows);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Atualização imediata quando o admin muda o status
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`my-orders-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "marketplace_purchases",
          filter: `user_id=eq.${userId}`,
        },
        () => fetchOrders(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchOrders]);

  const copyTracking = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Código copiado", description: code });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Card className="card-mystic">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Package className="h-12 w-12 opacity-30" />
          <p>Você ainda não fez nenhum pedido.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => {
        const statusInfo = getOrderStatusInfo(order.status);
        const isCancelled = statusInfo.value === "cancelled";
        const history = Array.isArray(order.status_history) ? order.status_history : [];
        const historyMap = new Map(
          history.map((entry) => [normalizeOrderStatus(entry.status), entry.at]),
        );

        return (
          <Card key={order.id} className="card-mystic overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {order.product_image ? (
                    <img
                      src={order.product_image}
                      alt={order.product_name}
                      className="h-14 w-14 rounded-lg object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted">
                      <Package className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <CardTitle className="text-base">{order.product_name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Pedido #{order.id.slice(0, 8)} · {formatDate(order.created_at)}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-secondary">
                      <Coins className="h-3 w-3" />
                      {order.total_price.toLocaleString()} · {order.quantity}x
                    </p>
                  </div>
                </div>
                <Badge className={`${statusInfo.color} border-0`}>{statusInfo.label}</Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {isCancelled ? (
                <p className="text-sm text-destructive">{statusInfo.description}</p>
              ) : (
                <ol className="relative space-y-3 border-l border-border/60 pl-5">
                  {ORDER_TIMELINE.map((step) => {
                    const reached = step.step <= statusInfo.step;
                    const at = historyMap.get(step.value);
                    return (
                      <li key={step.value} className="relative">
                        <span
                          className={`absolute -left-[1.42rem] top-1 h-3 w-3 rounded-full border-2 ${
                            reached
                              ? "border-primary bg-primary"
                              : "border-border bg-background"
                          }`}
                        />
                        <p
                          className={`text-sm font-medium ${
                            reached ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {step.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {at ? formatDate(at) : step.description}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}

              {(order.tracking_code || order.admin_notes) && <Separator />}

              {order.tracking_code && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Truck className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">Rastreio:</span>
                  <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                    {order.tracking_code}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => copyTracking(order.tracking_code as string)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              {order.admin_notes && (
                <div className="flex gap-2 rounded-lg bg-background/40 p-3 text-sm">
                  <StickyNote className="h-4 w-4 shrink-0 text-secondary" />
                  <p className="text-muted-foreground">{order.admin_notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
