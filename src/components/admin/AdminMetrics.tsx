/**
 * DuelVerse - Métricas da Plataforma (Admin)
 *
 * Todos os dados vêm agregados do backend (RPC admin_platform_metrics_v2).
 * O frontend apenas seleciona o período e renderiza.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Coins,
  Inbox,
  RefreshCw,
  ShoppingBag,
  Swords,
  Trophy,
  Users,
  Wifi,
} from "lucide-react";

interface SeriesPoint {
  day: string;
  signups: number;
  matches: number;
  rooms: number;
  tournaments: number;
  revenue_brl: number;
}

interface MetricsV2 {
  range: { from: string; to: string; prev_from: string; prev_to: string };
  users: {
    total: number;
    online: number;
    new_current: number;
    new_previous: number;
    active_current: number;
    active_previous: number;
    total_at_period_start: number;
  };
  rooms: {
    created_current: number;
    created_previous: number;
    active_now: number;
    waiting_now: number;
    closed_current: number;
    expired_current: number;
    avg_players: number;
  };
  duels: {
    matches_current: number;
    matches_previous: number;
    matches_total: number;
    in_progress_now: number;
    finished_current: number;
    ranked_current: number;
    casual_current: number;
    avg_duration_minutes: number;
  };
  tournaments: {
    created_current: number;
    created_previous: number;
    active_now: number;
    finished_total: number;
    participants_current: number;
    avg_participants: number;
    formats: { format: string; count: number }[];
  };
  economy: {
    duelcoins_moved: number;
    marketplace_sales: number;
    marketplace_revenue_dc: number;
    digital_sales: number;
    physical_sales: number;
    revenue_brl_current: number;
    revenue_brl_previous: number;
    revenue_brl_total: number;
    orders_paid: number;
    orders_pending: number;
    orders_cancelled: number;
    active_subscriptions: number;
  };
  series: SeriesPoint[];
}

type PresetKey = "today" | "7d" | "30d" | "90d" | "year" | "custom";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "year", label: "Ano" },
  { key: "custom", label: "Personalizado" },
];

const rangeForPreset = (preset: PresetKey): { from: Date; to: Date } => {
  const to = new Date();
  const from = new Date();
  switch (preset) {
    case "today":
      from.setHours(0, 0, 0, 0);
      break;
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "90d":
      from.setDate(from.getDate() - 90);
      break;
    case "year":
      from.setFullYear(from.getFullYear() - 1);
      break;
    default:
      from.setDate(from.getDate() - 30);
  }
  return { from, to };
};

const toInputValue = (date: Date) => date.toISOString().slice(0, 10);
const nf = (value: number) => Number(value ?? 0).toLocaleString("pt-BR");
const brl = (value: number) =>
  `R$ ${Number(value ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CHART_COLORS = ["hsl(var(--primary))", "#22c55e", "#f59e0b", "#38bdf8", "#a855f7"];

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  const pct = previous === 0 ? (current === 0 ? 0 : 100) : (diff / previous) * 100;
  const flat = Math.abs(pct) < 0.5;
  const up = diff > 0;
  const Icon = flat ? ArrowRight : up ? ArrowUpRight : ArrowDownRight;
  const color = flat ? "text-muted-foreground" : up ? "text-green-500" : "text-red-500";

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon className="w-3.5 h-3.5" />
      {flat ? "estável" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}
      <span className="text-muted-foreground font-normal">vs. anterior ({nf(previous)})</span>
    </span>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  previous,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  previous?: { current: number; previous: number };
  hint?: string;
}) {
  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          <Icon className="w-3.5 h-3.5" />
          {label}
        </div>
        <p className="text-2xl font-bold text-primary">{value}</p>
        {previous ? (
          <div className="mt-1">
            <TrendBadge current={previous.current} previous={previous.previous} />
          </div>
        ) : hint ? (
          <p className="text-xs text-muted-foreground mt-1">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  children,
  hasData,
}: {
  title: string;
  children: React.ReactElement;
  hasData: boolean;
}) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Inbox className="w-8 h-8" />
            <p className="text-sm">Sem dados no período selecionado.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminMetrics() {
  const [metrics, setMetrics] = useState<MetricsV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<PresetKey>("30d");
  const initial = rangeForPreset("30d");
  const [customFrom, setCustomFrom] = useState(toInputValue(initial.from));
  const [customTo, setCustomTo] = useState(toInputValue(initial.to));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const range =
      preset === "custom"
        ? { from: new Date(`${customFrom}T00:00:00`), to: new Date(`${customTo}T23:59:59`) }
        : rangeForPreset(preset);

    const { data, error: rpcError } = await (supabase.rpc as any)("admin_platform_metrics_v2", {
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
    });

    if (rpcError) {
      setError(rpcError.message);
      setMetrics(null);
    } else {
      setMetrics(data as MetricsV2);
    }
    setLoading(false);
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    load();
  }, [load]);

  const series = useMemo(
    () =>
      (metrics?.series || []).map((point) => ({
        ...point,
        label: new Date(point.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        signups: Number(point.signups),
        matches: Number(point.matches),
        rooms: Number(point.rooms),
        tournaments: Number(point.tournaments),
        revenue_brl: Number(point.revenue_brl),
      })),
    [metrics]
  );

  const hasSeriesData = (key: keyof SeriesPoint) => series.some((point) => Number(point[key]) > 0);

  const formatData = (metrics?.tournaments.formats || []).map((f) => ({
    name:
      f.format === "swiss_top4"
        ? "Suíço + Top 4"
        : f.format === "swiss"
        ? "Suíço"
        : "Mata-Mata",
    value: Number(f.count),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={preset === p.key ? "default" : "outline"}
              onClick={() => setPreset(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {preset === "custom" && (
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground mb-1">De</p>
            <Input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Até</p>
            <Input type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
          <Button size="sm" onClick={load} disabled={loading}>
            Aplicar
          </Button>
        </div>
      )}

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-muted-foreground">Não foi possível carregar as métricas: {error}</p>
            <Button size="sm" onClick={load}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : loading && !metrics ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : metrics ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Usuários registrados" value={nf(metrics.users.total)} icon={Users} />
            <MetricCard label="Online agora" value={nf(metrics.users.online)} icon={Wifi} />
            <MetricCard
              label="Novos usuários"
              value={nf(metrics.users.new_current)}
              icon={Users}
              previous={{ current: metrics.users.new_current, previous: metrics.users.new_previous }}
            />
            <MetricCard
              label="Usuários ativos"
              value={nf(metrics.users.active_current)}
              icon={Users}
              previous={{ current: metrics.users.active_current, previous: metrics.users.active_previous }}
            />

            <MetricCard
              label="Salas criadas"
              value={nf(metrics.rooms.created_current)}
              icon={Swords}
              previous={{ current: metrics.rooms.created_current, previous: metrics.rooms.created_previous }}
            />
            <MetricCard
              label="Salas ativas agora"
              value={nf(metrics.rooms.active_now)}
              icon={Swords}
              hint={`${nf(metrics.rooms.waiting_now)} aguardando jogadores`}
            />
            <MetricCard
              label="Salas expiradas"
              value={nf(metrics.rooms.expired_current)}
              icon={Swords}
              hint={`Média de ${metrics.rooms.avg_players} jogadores por sala`}
            />
            <MetricCard
              label="Duelos no período"
              value={nf(metrics.duels.matches_current)}
              icon={Swords}
              previous={{ current: metrics.duels.matches_current, previous: metrics.duels.matches_previous }}
            />

            <MetricCard
              label="Duelos ranqueados"
              value={nf(metrics.duels.ranked_current)}
              icon={Trophy}
              hint={`${nf(metrics.duels.casual_current)} casuais`}
            />
            <MetricCard
              label="Duração média"
              value={`${metrics.duels.avg_duration_minutes} min`}
              icon={Swords}
              hint={`${nf(metrics.duels.in_progress_now)} em andamento agora`}
            />
            <MetricCard
              label="Torneios criados"
              value={nf(metrics.tournaments.created_current)}
              icon={Trophy}
              previous={{
                current: metrics.tournaments.created_current,
                previous: metrics.tournaments.created_previous,
              }}
            />
            <MetricCard
              label="Participantes inscritos"
              value={nf(metrics.tournaments.participants_current)}
              icon={Trophy}
              hint={`Média de ${metrics.tournaments.avg_participants} por torneio`}
            />

            <MetricCard
              label="DuelCoins movimentadas"
              value={nf(metrics.economy.duelcoins_moved)}
              icon={Coins}
              hint={`${nf(metrics.economy.marketplace_revenue_dc)} DC no Marketplace`}
            />
            <MetricCard
              label="Vendas no Marketplace"
              value={nf(metrics.economy.marketplace_sales)}
              icon={ShoppingBag}
              hint={`${nf(metrics.economy.digital_sales)} digitais / ${nf(metrics.economy.physical_sales)} físicos`}
            />
            <MetricCard
              label="Receita no período (BRL)"
              value={brl(metrics.economy.revenue_brl_current)}
              icon={Coins}
              previous={{
                current: metrics.economy.revenue_brl_current,
                previous: metrics.economy.revenue_brl_previous,
              }}
            />
            <MetricCard
              label="Assinaturas ativas"
              value={nf(metrics.economy.active_subscriptions)}
              icon={Trophy}
              hint={`${nf(metrics.economy.orders_paid)} pedidos pagos · ${nf(metrics.economy.orders_pending)} pendentes`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Novos cadastros por dia" hasData={hasSeriesData("signups")}>
              <AreaChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  formatter={(value: number) => [nf(value), "Cadastros"]}
                />
                <Area type="monotone" dataKey="signups" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.25} />
              </AreaChart>
            </ChartCard>

            <ChartCard title="Duelos e salas por dia" hasData={hasSeriesData("matches") || hasSeriesData("rooms")}>
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Legend />
                <Line type="monotone" dataKey="matches" name="Duelos" stroke={CHART_COLORS[0]} dot={false} />
                <Line type="monotone" dataKey="rooms" name="Salas" stroke={CHART_COLORS[1]} dot={false} />
              </LineChart>
            </ChartCard>

            <ChartCard title="Receita por dia (BRL)" hasData={hasSeriesData("revenue_brl")}>
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  formatter={(value: number) => [brl(value), "Receita"]}
                />
                <Bar dataKey="revenue_brl" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Formatos de torneio no período" hasData={formatData.length > 0}>
              <PieChart>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Legend />
                <Pie data={formatData} dataKey="value" nameKey="name" outerRadius={90} label>
                  {formatData.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ChartCard>
          </div>
        </>
      ) : null}
    </div>
  );
}
