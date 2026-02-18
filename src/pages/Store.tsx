import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Store as StoreIcon, ExternalLink, Crown, Loader2, Coins, Check } from "lucide-react";

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_duelcoins: number;
  duration_days: number;
  duration_type: "weekly" | "monthly" | "yearly";
  is_active: boolean;
  is_featured: boolean;
}

export default function Store() {
  const [storeUrl, setStoreUrl] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [purchasingPlan, setPurchasingPlan] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
    fetchPlans();
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user ?? null);
    if (session?.user) {
      fetchProfile(session.user.id);
    }
  };

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (data) {
      setProfile(data);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['support_email', 'store_url']);
      
      if (error) throw error;
      
      if (data) {
        const emailSetting = data.find(s => s.key === 'support_email');
        const urlSetting = data.find(s => s.key === 'store_url');
        
        setSupportEmail(emailSetting?.value || 'suporte@duelverseonline.vercel.app');
        setStoreUrl(urlSetting?.value || 'https://loja.duelverseonline.vercel.app');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      setSupportEmail('suporte@duelverseonline.vercel.app');
      setStoreUrl('https://loja.duelverseonline.vercel.app');
    }
  };

  const fetchPlans = async () => {
    try {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("price_duelcoins", { ascending: true });

      if (error) throw error;
      setPlans(data || []);
    } catch (error) {
      console.error("Error fetching plans:", error);
    } finally {
      setLoadingPlans(false);
    }
  };

  const handleStoreAccess = () => {
    if (storeUrl) {
      const link = document.createElement('a');
      link.href = storeUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      toast({
        title: "Link não configurado",
        description: "O administrador ainda não configurou o link da loja.",
        variant: "destructive"
      });
    }
  };

  const handlePurchasePlan = async (plan: SubscriptionPlan) => {
    if (!user) {
      toast({
        title: "Login necessário",
        description: "Você precisa estar logado para comprar um plano.",
        variant: "destructive"
      });
      return;
    }

    if (!profile) {
      toast({
        title: "Erro",
        description: "Perfil não encontrado.",
        variant: "destructive"
      });
      return;
    }

    if (profile.duelcoins_balance < plan.price_duelcoins) {
      toast({
        title: "Saldo insuficiente",
        description: `Você precisa de ${plan.price_duelcoins} DuelCoins para comprar este plano.`,
        variant: "destructive"
      });
      return;
    }

    setPurchasingPlan(plan.id);

    try {
      await supabase.rpc('admin_manage_duelcoins', {
        p_user_id: user.id,
        p_amount: plan.price_duelcoins,
        p_operation: 'subtract',
        p_reason: `Purchase of ${plan.name} plan`
      });

      const { data: subscriptionData, error: subscriptionError } = await supabase.rpc(
        'activate_subscription',
        {
          p_user_id: user.id,
          p_plan_id: plan.id
        }
      );

      if (subscriptionError) throw subscriptionError;

      await supabase.from('duelcoins_transactions').insert({
        sender_id: user.id,
        receiver_id: null,
        amount: plan.price_duelcoins,
        transaction_type: 'plan_purchase',
        description: `Compra do plano: ${plan.name}`
      });

      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('duelcoins_balance')
        .eq('user_id', user.id)
        .single();
      
      if (updatedProfile) {
        setProfile({ ...profile, duelcoins_balance: updatedProfile.duelcoins_balance });
      }

      toast({
        title: "Plano ativado!",
        description: `Você agora é um usuário ${plan.name}. Aproveite os benefícios!`,
      });

      fetchPlans();
    } catch (error: any) {
      console.error("Error purchasing plan:", error);
      toast({
        title: "Erro na compra",
        description: error.message || "Não foi possível completar a compra.",
        variant: "destructive"
      });
    } finally {
      setPurchasingPlan(null);
    }
  };

  const getDurationLabel = (type: string) => {
    switch (type) {
      case "weekly":
        return "Semanal";
      case "monthly":
        return "Mensal";
      case "yearly":
        return "Anual";
      default:
        return type;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r from-primary to-primary/70 mb-4">
              <StoreIcon className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold gradient-text">
              Loja Duelverse
            </h1>
            <p className="text-xl text-muted-foreground">
              Acesse nossa loja oficial e descubra todas as opções disponíveis
            </p>
          </div>

          {/* Subscription Plans Section */}
          {user && (
            <Card className="card-mystic border-primary/50">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Crown className="w-6 h-6 text-yellow-500" />
                  Planos PRO
                </CardTitle>
                <CardDescription>
                  Torne-se um usuário PRO e tenha acesso a benefícios exclusivos
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingPlans ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                ) : plans.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum plano disponível no momento.
                  </p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {plans.map((plan) => (
                      <Card 
                        key={plan.id} 
                        className={`relative overflow-hidden ${
                          plan.is_featured 
                            ? "border-yellow-500 border-2 bg-yellow-500/5" 
                            : "border-primary/30"
                        }`}
                      >
                        {plan.is_featured && (
                          <div className="absolute top-0 right-0 bg-yellow-500 text-black text-xs font-bold px-3 py-1 rounded-bl-lg">
                            MAIS POPULAR
                          </div>
                        )}
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center gap-2">
                            <Crown className="w-5 h-5 text-yellow-500" />
                            {plan.name}
                          </CardTitle>
                          <CardDescription className="line-clamp-2">
                            {plan.description || "Aproveite todos os benefícios PRO"}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-1 text-3xl font-bold text-primary">
                                <Coins className="w-6 h-6" />
                                {plan.price_duelcoins}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {getDurationLabel(plan.duration_type)}
                              </p>
                            </div>

                            <div className="space-y-2 text-sm">
                              <div className="flex items-center gap-2">
                                <Check className="w-4 h-4 text-green-500" />
                                <span>Acesso a funcionalidades exclusivas</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Check className="w-4 h-4 text-green-500" />
                                <span>Prioridade no matchmaking</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Check className="w-4 h-4 text-green-500" />
                                <span>Perfil com coroa dourada</span>
                              </div>
                            </div>

                            <Button
                              onClick={() => handlePurchasePlan(plan)}
                              disabled={purchasingPlan === plan.id || profile.duelcoins_balance < plan.price_duelcoins}
                              className="w-full"
                              variant={plan.is_featured ? "default" : "outline"}
                            >
                              {purchasingPlan === plan.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Comprando...
                                </>
                              ) : profile.duelcoins_balance < plan.price_duelcoins ? (
                                "Saldo Insuficiente"
                              ) : (
                                <>Comprar com {plan.price_duelcoins} DC</>
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                <div className="mt-4 p-4 bg-muted/50 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins className="w-5 h-5 text-yellow-500" />
                    <span className="text-sm">Seu saldo:</span>
                    <span className="font-bold text-primary">{profile?.duelcoins_balance || 0} DuelCoins</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => window.location.href = '/duelcoins'}>
                    Ver saldo
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Store Access Card */}
          <Card className="card-mystic border-primary/50">
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-2">
                <StoreIcon className="w-6 h-6 text-primary" />
                Loja Externa
              </CardTitle>
              <CardDescription>
                Visite nossa loja oficial para produtos físicos e virtuais
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Na nossa loja você encontra planos personalizados, moedas do game e muito mais
                </p>
                
                <Button 
                  onClick={handleStoreAccess}
                  className="w-full btn-mystic"
                  size="lg"
                >
                  <StoreIcon className="w-5 h-5 mr-2" />
                  Acessar Loja Duelverse
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Support Card */}
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center">
                Precisa de ajuda? Entre em contato com nosso suporte através do email{" "}
                {supportEmail && (
                  <a 
                    href={`mailto:${supportEmail}`} 
                    className="text-primary hover:underline font-medium"
                  >
                    {supportEmail}
                  </a>
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
