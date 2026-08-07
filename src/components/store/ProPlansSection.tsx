/**
 * DuelVerse - Seção de Planos PRO
 * Componente reutilizável com a listagem e compra de planos de assinatura.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Loader2, Coins, Check, Clock } from "lucide-react";

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_duelcoins: number;
  duration_days: number;
  duration_type: string;
  is_active: boolean;
  is_featured: boolean;
}

interface ActiveSubscription {
  id: string;
  plan_id: string;
  expires_at: string;
  is_active: boolean;
}

interface ProPlansSectionProps {
  userId?: string | null;
  balance?: number;
  onPurchased?: () => void;
}

export function ProPlansSection({ userId, balance, onPurchased }: ProPlansSectionProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasingPlan, setPurchasingPlan] = useState<string | null>(null);
  const [activeSubscription, setActiveSubscription] = useState<ActiveSubscription | null>(null);
  const [localBalance, setLocalBalance] = useState<number>(balance ?? 0);
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (typeof balance === "number") setLocalBalance(balance);
  }, [balance]);

  useEffect(() => {
    fetchPlans();
  }, []);

  useEffect(() => {
    if (userId) {
      fetchActiveSubscription(userId);
      fetchBalance(userId);
    } else {
      setActiveSubscription(null);
    }
  }, [userId]);

  useEffect(() => {
    if (!activeSubscription) return;
    const update = () => setTimeLeft(getTimeLeft(activeSubscription.expires_at));
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [activeSubscription]);

  const getTimeLeft = (expiresAt: string) => {
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return "—";
    const days = Math.floor(diffMs / 86400000);
    const hours = Math.floor((diffMs % 86400000) / 3600000);
    if (days > 0) return `${days}d ${hours}h`;
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const fetchPlans = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("price_duelcoins", { ascending: true });
      if (error) throw error;
      setPlans((data as SubscriptionPlan[]) || []);
    } catch (error) {
      console.error("Error fetching plans:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBalance = async (uid: string) => {
    const { data } = await supabase.from("profiles").select("duelcoins_balance").eq("user_id", uid).maybeSingle();
    if (data) setLocalBalance(data.duelcoins_balance);
  };

  const fetchActiveSubscription = async (uid: string) => {
    const { data } = await (supabase as any)
      .from("user_subscriptions")
      .select("*")
      .eq("user_id", uid)
      .eq("is_active", true)
      .gte("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1);
    setActiveSubscription(data && data.length > 0 ? data[0] : null);
  };

  const hasActivePlan = !!activeSubscription;

  const handlePurchasePlan = async (plan: SubscriptionPlan) => {
    if (!userId) {
      toast({ title: "Login necessário", description: "Você precisa estar logado para comprar um plano.", variant: "destructive" });
      return;
    }
    if (hasActivePlan) {
      toast({ title: "Plano ativo", description: "Você já possui um plano ativo.", variant: "destructive" });
      return;
    }
    if (localBalance < plan.price_duelcoins) {
      toast({ title: "Saldo insuficiente", description: `Você precisa de ${plan.price_duelcoins} DuelCoins.`, variant: "destructive" });
      return;
    }

    setPurchasingPlan(plan.id);
    try {
      const { data, error } = await (supabase as any).rpc("activate_subscription", { p_user_id: userId, p_plan_id: plan.id });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.message);

      await fetchActiveSubscription(userId);
      await fetchBalance(userId);
      onPurchased?.();
      toast({ title: "Plano ativado!", description: `Você agora é um usuário ${plan.name}.` });
    } catch (error: any) {
      toast({ title: "Erro na compra", description: error.message || "Não foi possível completar a compra.", variant: "destructive" });
    } finally {
      setPurchasingPlan(null);
    }
  };

  const getDurationLabel = (type: string) => {
    switch (type) {
      case "weekly": return t("store.weekly", "Semanal");
      case "monthly": return t("store.monthly", "Mensal");
      case "yearly": return t("store.yearly", "Anual");
      default: return type;
    }
  };

  return (
    <div className="space-y-4">
      {hasActivePlan && (
        <Card className="border-yellow-500 border-2 bg-yellow-500/10">
          <CardContent className="py-4 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Crown className="w-6 h-6 text-yellow-500" />
              <div>
                <p className="font-bold text-lg">{t("store.youArePro", "Você é PRO")}</p>
                <p className="text-sm text-muted-foreground">{t("store.planActive", "Plano ativo")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-background/80 rounded-lg px-4 py-2">
              <Clock className="w-5 h-5 text-yellow-500" />
              <span className="font-semibold text-sm">{timeLeft}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="card-mystic border-primary/50">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <Crown className="w-6 h-6 text-yellow-500" />
            {t("store.proPlans", "Planos PRO")}
          </CardTitle>
          <CardDescription>{t("store.proPlansDesc", "Aproveite benefícios exclusivos")}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : plans.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t("store.noPlans", "Nenhum plano disponível")}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <Card
                  key={plan.id}
                  className={`relative overflow-hidden ${plan.is_featured ? "border-yellow-500 border-2 bg-yellow-500/5" : "border-primary/30"} ${hasActivePlan ? "opacity-60" : ""}`}
                >
                  {plan.is_featured && (
                    <div className="absolute top-0 right-0 bg-yellow-500 text-black text-xs font-bold px-3 py-1 rounded-bl-lg">
                      {t("store.popular", "Popular")}
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2">
                      <Crown className="w-5 h-5 text-yellow-500" />
                      {plan.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {plan.description || t("store.proPlansDesc", "Aproveite benefícios exclusivos")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-3xl font-bold text-primary">
                          <Coins className="w-6 h-6" />
                          {plan.price_duelcoins}
                        </div>
                        <p className="text-sm text-muted-foreground">{getDurationLabel(plan.duration_type)}</p>
                      </div>

                      <div className="space-y-2 text-sm">
                        {[t("store.benefit1", "Sem anúncios"), t("store.benefit2", "Recursos exclusivos"), t("store.benefit3", "Selo PRO")].map((b, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-green-500" />
                            <span>{b}</span>
                          </div>
                        ))}
                      </div>

                      <Button
                        onClick={() => handlePurchasePlan(plan)}
                        disabled={purchasingPlan === plan.id || !userId || hasActivePlan || localBalance < plan.price_duelcoins}
                        className="w-full"
                        variant={plan.is_featured ? "default" : "outline"}
                      >
                        {purchasingPlan === plan.id ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            {t("store.buying", "Comprando...")}
                          </>
                        ) : !userId ? (
                          t("store.loginToBuy", "Entre para comprar")
                        ) : hasActivePlan ? (
                          t("store.planActiveBtn", "Plano ativo")
                        ) : localBalance < plan.price_duelcoins ? (
                          t("store.noBalance", "Saldo insuficiente")
                        ) : (
                          t("store.buyWith", { amount: plan.price_duelcoins, defaultValue: `Comprar por ${plan.price_duelcoins}` })
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
