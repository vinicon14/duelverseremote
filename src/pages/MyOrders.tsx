/**
 * DuelVerse - Meus Pedidos
 * Lista todos os pedidos do usuário com status e código de rastreio.
 * Textos localizados via i18n (namespace `orders`).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Package, Loader2, Copy, ShoppingBag, Truck } from "lucide-react";

interface OrderRow {
  id: string;
  quantity: number;
  total_price: number;
  status: string;
  tracking_code: string | null;
  created_at: string;
  shipping_address: string | null;
  shipping_number: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;
  marketplace_products: { name: string; image_url: string | null; category: string; product_type: string } | null;
}

/** Classes visuais por status — os rótulos vêm do i18n (`orders.status.*`). */
export const ORDER_STATUS_CLASSES: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-500",
  paid: "bg-emerald-500/20 text-emerald-400",
  completed: "bg-green-500/20 text-green-500",
  preparing: "bg-blue-500/20 text-blue-400",
  shipped: "bg-purple-500/20 text-purple-400",
  shipping: "bg-orange-500/20 text-orange-400",
  delivered: "bg-green-500/20 text-green-500",
  cancelled: "bg-destructive/20 text-destructive",
};

export default function MyOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/auth");
        return;
      }
      const { data, error } = await supabase
        .from("marketplace_purchases")
        .select("*, marketplace_products(name, image_url, category, product_type)")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (error) {
        toast({ title: t("orders.error"), description: t("orders.loadError"), variant: "destructive" });
      } else {
        setOrders((data as unknown as OrderRow[]) || []);
      }
      setLoading(false);
    };
    load();
  }, [navigate, toast, t]);

  const copyTracking = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: t("orders.copied"), description: code });
  };

  return (
    <div className="min-h-screen bg-transparent">
      <Navbar />
      <main className="container mx-auto px-4 py-8 pt-24 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Package className="w-7 h-7 text-primary" />
          <h1 className="text-2xl sm:text-3xl font-bold text-gradient-mystic">{t("orders.title")}</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ShoppingBag className="w-16 h-16 mb-4 opacity-30" />
            <p className="mb-4">{t("orders.empty")}</p>
            <Button className="btn-mystic" onClick={() => navigate("/marketplace")}>{t("orders.goStore")}</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => {
              const statusClass = ORDER_STATUS_CLASSES[order.status] || "bg-muted text-muted-foreground";
              const statusLabel = t(`orders.status.${order.status}`, { defaultValue: order.status });
              const product = order.marketplace_products;
              return (
                <Card key={order.id} className="border-border">
                  <CardContent className="p-4 flex gap-4 items-start">
                    {product?.image_url ? (
                      <img src={product.image_url} alt={product.name} loading="lazy" className="w-16 h-16 rounded object-cover" />
                    ) : (
                      <div className="w-16 h-16 rounded bg-muted flex items-center justify-center">
                        <Package className="w-7 h-7 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <p className="font-semibold">{product?.name || t("orders.removed")}</p>
                        <Badge className={`${statusClass} border-0`}>{statusLabel}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleString(i18n.language)} · {order.quantity}x · {order.total_price} DuelCoins
                      </p>
                      {order.shipping_address && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Truck className="w-3 h-3" />
                          {order.shipping_address}, {order.shipping_number} — {order.shipping_city}/{order.shipping_state} · {order.shipping_zip}
                        </p>
                      )}
                      {order.tracking_code && (
                        <button
                          onClick={() => copyTracking(order.tracking_code!)}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          {t("orders.tracking")}: {order.tracking_code}
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
