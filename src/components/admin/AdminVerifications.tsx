import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { BadgeCheck, Loader2, Check, X, Clock } from "lucide-react";
import { formatCpf } from "@/utils/cpf";

export const AdminVerifications = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    let q = supabase.from("verification_requests" as any).select("*").order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    const list = (data as any[]) || [];
    // attach profile info
    const ids = [...new Set(list.map((r) => r.user_id))];
    if (ids.length) {
      const { data: profiles } = await supabase.from("profiles").select("user_id, username, display_name, avatar_url").in("user_id", ids);
      const map = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      list.forEach((r) => (r.profile = map.get(r.user_id)));
    }
    setItems(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("verif_admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "verification_requests" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [filter]);

  const review = async (id: string, approve: boolean) => {
    setBusy(id);
    const { data, error } = await (supabase as any).rpc("review_verification_request", {
      _request_id: id,
      _approve: approve,
      _reason: approve ? null : reasons[id] || null,
    });
    setBusy(null);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: approve ? "✅ Aprovado" : "Rejeitado" });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BadgeCheck className="w-6 h-6 text-sky-500" />
            Verificações
          </h2>
          <p className="text-sm text-muted-foreground">Aprovar ou rejeitar pedidos de verificação via CPF.</p>
        </div>
        <div className="flex gap-2">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "pending" ? "Pendentes" : f === "approved" ? "Aprovados" : f === "rejected" ? "Rejeitados" : "Todos"}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">Nenhum pedido encontrado.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {r.profile?.display_name || r.profile?.username || "Usuário"}
                      {r.status === "pending" && (
                        <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pendente</Badge>
                      )}
                      {r.status === "approved" && (
                        <Badge className="bg-sky-500"><Check className="w-3 h-3 mr-1" />Aprovado</Badge>
                      )}
                      {r.status === "rejected" && (
                        <Badge variant="destructive"><X className="w-3 h-3 mr-1" />Rejeitado</Badge>
                      )}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      @{r.profile?.username} • {new Date(r.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3 text-sm">
                  <div><span className="text-muted-foreground">Nome:</span> <strong>{r.full_name}</strong></div>
                  <div><span className="text-muted-foreground">CPF:</span> <strong>{formatCpf(r.cpf)}</strong></div>
                  <div><span className="text-muted-foreground">Nascimento:</span> <strong>{r.birth_date ? new Date(r.birth_date).toLocaleDateString("pt-BR") : "—"}</strong></div>
                </div>
                {r.status === "rejected" && r.rejection_reason && (
                  <p className="text-sm text-red-500">Motivo: {r.rejection_reason}</p>
                )}
                {r.status === "pending" && (
                  <div className="flex gap-2 flex-wrap items-center">
                    <Input
                      placeholder="Motivo da rejeição (opcional)"
                      value={reasons[r.id] || ""}
                      onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })}
                      className="max-w-xs"
                    />
                    <Button size="sm" onClick={() => review(r.id, true)} disabled={busy === r.id}>
                      {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                      Aprovar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => review(r.id, false)} disabled={busy === r.id}>
                      <X className="w-4 h-4 mr-1" />
                      Rejeitar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
