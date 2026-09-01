/**
 * DuelVerse - Página compartilhável "Vire PRO"
 * Link direto: /go-pro (opcional ?plan=<id>)
 * Compra com DuelCoins: os coins são deduzidos e o plano fica ativo na hora.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Crown, Coins, Check, Loader2, Share2, Clock, ShieldCheck } from "lucide-react";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price_duelcoins: number;
  duration_days: number;
  duration_type: string;
  is_featured: boolean;
}

const BENEFITS = [
  "Sem anúncios em toda a plataforma",
  "Selo PRO no perfil e nas salas de duelo",
  "Gravação e compartilhamento de partidas",
  "Recursos exclusivos de torneios e arena",
];

export default function GoPro() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const planParam = params.get("plan");

  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [activeUntil, setActiveUntil] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id ?? null;
    setUserId(uid);

    const { data: planData } = await (supabase as any)
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .order("price_duelcoins", { ascending: true });

    const list = (planData as Plan[]) || [];
    setPlans(list);
    setSelectedId(
      (planParam && list.find((p) => p.id === planParam)?.id) ||
        list.find((p) => p.is_featured)?.id ||
        list[0]?.id ||
        null
    );

    if (uid) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("duelcoins_balance")
        .eq("user_id", uid)
        .maybeSingle();
      setBalance(profile?.duelcoins_balance ?? 0);

      const { data: subs } = await (supabase as any)
        .from("user_subscriptions")
        .select("expires_at")
        .eq("user_id", uid)
        .eq("is_active", true)
        .gte("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1);
      setActiveUntil(subs && subs.length > 0 ? subs[0].expires_at : null);
    }
    setLoading(false);
  }, [planParam]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = plans.find((p) => p.id === selectedId) || null;
  const missing = selected ? Math.max(0, selected.price_duelcoins - balance) : 0;

  const handleShare = async () => {
    const url = `${window.location.origin}/go-pro${selected ? `?plan=${selected.id}` : ""}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Seja PRO no DuelVerse", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copiado!", description: url });
      }
    } catch {
      /* usuário cancelou */
    }
  };

  const handleActivate = async () => {
    if (!selected) return;
    if (!userId) {
      navigate("/auth", { state: { returnTo: `/go-pro?plan=${selected.id}` } });
      return;
    }
    setProcessing(true);
    try {
      const { data, error } = await (supabase as any).rpc("activate_subscription", {
        p_user_id: userId,
        p_plan_id: selected.id,
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.message);
      toast({
        title: "Você agora é PRO!",
        description: `${selected.price_duelcoins} DuelCoins deduzidos. Plano ${selected.name} ativo.`,
      });
      await load();
    } catch (e: any) {
      toast({
        title: "Não foi possível ativar",
        description: e.message || "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <main className="mx-auto w-full max-w-2xl px-4 py-8 space-y-6">
        <header className="text-center space-y-3">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-yellow-500/15 border border-yellow-500/40">
            <Crown className="h-7 w-7 text-yellow-500" />
          </div>
          <h1 className="text-3xl font-bold">Seja PRO no DuelVerse</h1>
          <p className="text-muted-foreground text-sm">
            Pague com DuelCoins e ative seu plano na hora — sem burocracia.
          </p>
        </header>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : activeUntil ? (
          <Card className="border-yellow-500/60 border-2 bg-yellow-500/10">
            <CardContent className="py-6 text-center space-y-3">
              <Crown className="h-8 w-8 text-yellow-500 mx-auto" />
              <p className="text-lg font-bold">Você já é PRO</p>
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Clock className="h-4 w-4" />
                Ativo até {new Date(activeUntil).toLocaleDateString("pt-BR")}
              </p>
              <Button className="w-full" onClick={() => navigate("/pro/home")}>
                Ir para a área PRO
              </Button>
            </CardContent>
          </Card>
        ) : plans.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Nenhum plano disponível no momento.</p>
        ) : (
          <>
            <div className="grid gap-3">
              {plans.map((plan) => {
                const active = plan.id === selectedId;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedId(plan.id)}
                    className={`w-full text-left rounded-xl border p-4 transition-colors ${
                      active ? "border-yellow-500 bg-yellow-500/10" : "border-border bg-card hover:bg-accent/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold truncate">{plan.name}</span>
                          {plan.is_featured && <Badge className="bg-yellow-500 text-black">Popular</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {plan.description || `${plan.duration_days} dias de acesso PRO`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-lg font-bold text-primary shrink-0">
                        <Coins className="h-5 w-5" />
                        {plan.price_duelcoins}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">O que você recebe</CardTitle>
                <CardDescription>Benefícios liberados imediatamente após a ativação.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {BENEFITS.map((b) => (
                  <div key={b} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <span>{b}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Seu saldo</span>
                <span className="font-semibold flex items-center gap-1">
                  <Coins className="h-4 w-4 text-primary" />
                  {userId ? balance : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Valor do plano</span>
                <span className="font-semibold flex items-center gap-1">
                  <Coins className="h-4 w-4 text-primary" />
                  {selected?.price_duelcoins ?? 0}
                </span>
              </div>

              {userId && missing > 0 ? (
                <Button className="w-full h-12" onClick={() => navigate("/buy-duelcoins")}>
                  Faltam {missing} DuelCoins — comprar agora
                </Button>
              ) : (
                <Button
                  className="w-full h-12 text-base font-semibold"
                  disabled={processing || !selected}
                  onClick={handleActivate}
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Ativando...
                    </>
                  ) : !userId ? (
                    "Entrar e virar PRO"
                  ) : (
                    `Virar PRO por ${selected?.price_duelcoins} DuelCoins`
                  )}
                </Button>
              )}

              <p className="text-[11px] text-muted-foreground flex items-center gap-1 justify-center">
                <ShieldCheck className="h-3 w-3" /> Pagamento em DuelCoins, ativação instantânea.
              </p>
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 className="h-4 w-4 mr-2" /> Compartilhar link
          </Button>
          <Link to="/" className="text-xs text-muted-foreground underline">
            Voltar ao início
          </Link>
        </div>
      </main>
    </div>
  );
}
