/**
 * DuelVerse - Distribuição de usuários por país (Admin)
 * Dados agregados no backend via RPC admin_country_metrics.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Globe, RefreshCw } from "lucide-react";
import { COUNTRIES } from "@/i18n/countries";

interface CountryRow {
  country_code: string;
  total: number;
  online: number;
  new_in_period: number;
}

const COLORS = ["hsl(var(--primary))", "#22c55e", "#f59e0b", "#38bdf8", "#a855f7", "#ef4444"];

const countryInfo = (code: string) => {
  if (code === "ZZ") return { name: "Não informado", flag: "🏳️" };
  const c = COUNTRIES.find((x) => x.code === code);
  return { name: c?.name ?? code, flag: c?.flag ?? "🏳️" };
};

export function AdminCountries() {
  const [rows, setRows] = useState<CountryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const { data } = await (supabase.rpc as any)("admin_country_metrics", {
      p_from: from.toISOString(),
      p_to: new Date().toISOString(),
    });
    setRows(
      ((data ?? []) as any[]).map((r) => ({
        country_code: r.country_code,
        total: Number(r.total),
        online: Number(r.online),
        new_in_period: Number(r.new_in_period),
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const total = rows.reduce((s, r) => s + r.total, 0);
  const identified = rows.filter((r) => r.country_code !== "ZZ");
  const chartData = identified.slice(0, 10).map((r) => ({
    ...r,
    label: `${countryInfo(r.country_code).flag} ${r.country_code}`,
  }));

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="h-4 w-4 text-primary" /> Usuários por país
        </CardTitle>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Sem dados de país ainda.</p>
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                    formatter={(value: number) => [value, "Usuários"]}
                  />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={entry.country_code} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2">País</th>
                    <th className="py-2">Usuários</th>
                    <th className="py-2">%</th>
                    <th className="py-2">Online</th>
                    <th className="py-2">Novos (30d)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.country_code} className="border-t border-border">
                      <td className="py-2">
                        {countryInfo(r.country_code).flag} {countryInfo(r.country_code).name}
                      </td>
                      <td className="py-2 font-medium">{r.total}</td>
                      <td className="py-2 text-muted-foreground">
                        {total > 0 ? ((r.total / total) * 100).toFixed(1) : "0.0"}%
                      </td>
                      <td className="py-2">{r.online}</td>
                      <td className="py-2">{r.new_in_period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
