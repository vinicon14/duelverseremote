/**
 * DuelVerse - Métricas da Plataforma (Admin)
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, Swords, ShoppingBag, TrendingUp, RefreshCw, Coins, Trophy, Wifi } from "lucide-react";

interface Metrics {
  total_users: number;
  online_users: number;
  active_today: number;
  active_7d: number;
  new_users_today: number;
  new_users_period: number;
  total_matches: number;
  matches_period: number;
  ranked_matches: number;
  casual_matches: number;
  live_duels_now: number;
  tournaments_total: number;
  marketplace_sales: number;
  marketplace_revenue_dc: number;
  duelcoins_orders_paid: number;
  revenue_brl: number;
  revenue_brl_period: number;
  active_subscriptions: number;
  signups_series: { day: string; count: number }[];
  matches_series: { day: string; count: number }[];
}

const PERIODS = [7, 30, 90];

export function AdminMetrics() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const { toast } = useToast();

  const load = async (period: number) => {
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("admin_platform_metrics", { p_days: period });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setMetrics(data as Metrics);
    }
    setLoading(false);
  };

  useEffect(() => {
    load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const stats = metrics
    ? [
        { label: "Usuários registrados", value: metrics.total_users, icon: Users },
        { label: "Online agora", value: metrics.online_users, icon: Wifi },
        { label: "Ativos hoje", value: metrics.active_today, icon: Users },
        { label: "Ativos (7 dias)", value: metrics.active_7d, icon: Users },
        { label: "Novos hoje", value: metrics.new_users_today, icon: TrendingUp },
        { label: `Novos (${days} dias)`, value: metrics.new_users_period, icon: TrendingUp },
        { label: "Partidas totais", value: metrics.total_matches, icon: Swords },
        { label: `Partidas (${days} dias)`, value: metrics.matches_period, icon: Swords },
        { label: "Partidas ranqueadas", value: metrics.ranked_matches, icon: Trophy },
        { label: "Partidas casuais", value: metrics.casual_matches, icon: Swords },
        { label: "Duelos em andamento", value: metrics.live_duels_now, icon: Swords },
        { label: "Torneios criados", value: metrics.tournaments_total, icon: Trophy },
        { label: "Vendas no Marketplace", value: metrics.marketplace_sales, icon: ShoppingBag },
        { label: "Receita Marketplace (DC)", value: metrics.marketplace_revenue_dc, icon: Coins },
        { label: "Assinaturas ativas", value: metrics.active_subscriptions, icon: Trophy },
        { label: "Pedidos pagos (DuelCoins)", value: metrics.duelcoins_orders_paid, icon: ShoppingBag },
      ]
    : [];

  const maxSignup = Math.max(1, ...(metrics?.signups_series || []).map((d) => Number(d.count)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <Button key={p} size="sm" variant={days === p ? "default" : "outline"} onClick={() => setDays(p)}>
              {p} dias
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => load(days)} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {loading && !metrics ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.map((s) => (
              <Card key={s.label} className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <s.icon className="w-3.5 h-3.5" />
                    {s.label}
                  </div>
                  <p className="text-2xl font-bold text-primary">{Number(s.value ?? 0).toLocaleString("pt-BR")}</p>
                </CardContent>
              </Card>
            ))}
            <Card className="border-border col-span-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Coins className="w-3.5 h-3.5" />
                  Receita total / no período (BRL)
                </div>
                <p className="text-2xl font-bold text-green-500">
                  R$ {Number(metrics?.revenue_brl ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  <span className="text-sm text-muted-foreground font-normal">
                    {" "}/ R$ {Number(metrics?.revenue_brl_period ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-lg">Novos cadastros por dia</CardTitle>
            </CardHeader>
            <CardContent>
              {(metrics?.signups_series?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados no período.</p>
              ) : (
                <div className="flex items-end gap-1 h-40">
                  {metrics!.signups_series.map((d) => (
                    <div key={d.day} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${d.day}: ${d.count}`}>
                      <div
                        className="w-full bg-primary/70 rounded-t"
                        style={{ height: `${(Number(d.count) / maxSignup) * 100}%`, minHeight: "2px" }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
