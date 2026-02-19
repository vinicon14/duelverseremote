import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Store as StoreIcon, ExternalLink, Crown, Loader2, Coins, Check, Clock, Info, Star, Zap, Shield } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const [timeLeft, setTimeLeft] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
    fetchPlans();
    checkUser();
  }, []);

  // Update countdown every minute
  useEffect(() => {
    if (!profile?.expires_at) return;
    const update = () => setTimeLeft(getTimeLeft(profile.expires_at));
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [profile?.expires_at]);

  const getTimeLeft = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffMs = expires.getTime() - now.getTime();
    if (diffMs <= 0) return "Expirado";
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h restantes`;
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m restantes`;
  };

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
    if (data) setProfile(data);
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
      toast({ title: "Login necessário", description: "Você precisa estar logado para comprar um plano.", variant: "destructive" });
      return;
    }
    if (!profile) {
      toast({ title: "Erro", description: "Perfil não encontrado.", variant: "destructive" });
      return;
    }
    if (profile.account_type === 'pro') {
      toast({ title: "Você já é PRO", description: "Você já possui status PRO.", variant: "destructive" });
      return;
    }

    const currentBalance = profile.duelcoins_balance ?? 0;
    if (currentBalance < plan.price_duelcoins) {
      toast({ title: "Saldo insuficiente", description: `Você precisa de ${plan.price_duelcoins} DuelCoins para comprar este plano.`, variant: "destructive" });
      return;
    }

    setPurchasingPlan(plan.id);
    try {
      // Simple approach: just update account_type to pro
      
      // Deduct coins
      const { error: deductError } = await supabase
        .from('profiles')
        .update({ duelcoins_balance: currentBalance - plan.price_duelcoins })
        .eq('user_id', user.id);

      if (deductError) throw deductError;

      // Set user as pro
      const { error: proError } = await supabase
        .from('profiles')
        .update({ account_type: 'pro' })
        .eq('user_id', user.id);

      if (proError) {
        console.error('Pro error:', proError);
        throw new Error(proError.message || 'Erro ao ativar PRO');
      }

      // Refresh profile
      await fetchProfile(user.id);

      toast({
        title: "Plano ativado!",
        description: `Você agora é um usuário ${plan.name}. Aproveite os benefícios!`,
      });
    } catch (error: any) {
      console.error("Error purchasing plan:", error);
      toast({ title: "Erro na compra", description: error.message || "Não foi possível completar a compra.", variant: "destructive" });
    } finally {
      setPurchasingPlan(null);
    }
  };

  const getDurationLabel = (type: string) => {
    switch (type) {
      case "weekly": return "Semanal";
      case "monthly": return "Mensal";
      case "yearly": return "Anual";
      default: return type;
    }
  };

  const isProUser = profile?.account_type === 'pro';

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
            <h1 className="text-4xl font-bold gradient-text">Loja Duelverse</h1>
            <p className="text-xl text-muted-foreground">Acesse nossa loja oficial e descubra todas as opções disponíveis</p>
          </div>

          {/* Active Subscription Banner */}
          {isProUser && (
            <Card className="border-yellow-500 border-2 bg-yellow-500/10">
              <CardContent className="py-4 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <Crown className="w-6 h-6 text-yellow-500" />
                  <div>
                    <p className="font-bold text-lg">Você é PRO!</p>
                    <p className="text-sm text-muted-foreground">Seu plano está ativo</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-background/80 rounded-lg px-4 py-2">
                  <Clock className="w-5 h-5 text-yellow-500" />
                  <span className="font-semibold text-sm">{timeLeft}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Subscription Plans Section */}
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
                <p className="text-center text-muted-foreground py-8">Nenhum plano disponível no momento.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {plans.map((plan) => (
                    <Card 
                      key={plan.id} 
                      className={`relative overflow-hidden ${
                        plan.is_featured 
                          ? "border-yellow-500 border-2 bg-yellow-500/5" 
                          : "border-primary/30"
                      } ${isProUser ? "opacity-60" : ""}`}
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
                            <p className="text-sm text-muted-foreground">{getDurationLabel(plan.duration_type)}</p>
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

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedPlan(plan)}
                              className="flex-1"
                            >
                              <Info className="w-4 h-4 mr-1" />
                              Ver detalhes
                            </Button>
                            <Button
                              onClick={() => handlePurchasePlan(plan)}
                              disabled={purchasingPlan === plan.id || !user || isProUser || !profile || (profile?.duelcoins_balance ?? 0) < plan.price_duelcoins}
                              className="flex-1"
                              variant={plan.is_featured ? "default" : "outline"}
                            >
                            {purchasingPlan === plan.id ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Comprando...
                              </>
                            ) : !user ? (
                              "Faça login para comprar"
                            ) : isProUser ? (
                              "Plano ativo"
                            ) : (profile?.duelcoins_balance ?? 0) < plan.price_duelcoins ? (
                              "Saldo Insuficiente"
                            ) : (
                              <>Comprar com {plan.price_duelcoins} DC</>
                            )}
                          </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {user && (
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
              )}
            </CardContent>
          </Card>

          {/* Plan Details Dialog */}
          <Dialog open={!!selectedPlan} onOpenChange={() => setSelectedPlan(null)}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              {selectedPlan && (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                      <Crown className="w-6 h-6 text-yellow-500" />
                      {selectedPlan.name}
                    </DialogTitle>
                    <DialogDescription>
                      Detalhes do plano de assinatura PRO
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4">
                    {selectedPlan.image_url && (
                      <img 
                        src={selectedPlan.image_url} 
                        alt={selectedPlan.name}
                        className="w-full h-40 object-cover rounded-lg"
                      />
                    )}
                    
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="flex items-center justify-center gap-1 text-3xl font-bold text-primary">
                        <Coins className="w-8 h-8" />
                        {selectedPlan.price_duelcoins}
                      </div>
                      <p className="text-muted-foreground">{getDurationLabel(selectedPlan.duration_type)}</p>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center gap-2">
                        <Star className="w-4 h-4 text-yellow-500" />
                        Benefícios incluídos:
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-blue-500" />
                          <span>Acesso prioritário ao matchmaking</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-green-500" />
                          <span>Perfil verificado com coroa dourada</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Crown className="w-4 h-4 text-yellow-500" />
                          <span>Badges exclusivos PRO</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-500" />
                          <span>Acesso a funcionalidades exclusivas</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-500" />
                          <span>Suporte prioritário</span>
                        </div>
                      </div>
                    </div>

                    {selectedPlan.description && (
                      <div className="p-3 bg-muted/30 rounded-lg">
                        <p className="text-sm text-muted-foreground">{selectedPlan.description}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
                      <span>Duração:</span>
                      <span className="font-medium">{selectedPlan.duration_days} dias</span>
                    </div>

                    <Button 
                      onClick={() => {
                        setSelectedPlan(null);
                        handlePurchasePlan(selectedPlan);
                      }}
                      disabled={!user || isProUser || !profile || (profile?.duelcoins_balance ?? 0) < selectedPlan.price_duelcoins}
                      className="w-full"
                      variant={selectedPlan.is_featured ? "default" : "outline"}
                    >
                      {!user ? (
                        "Faça login para comprar"
                      ) : isProUser ? (
                        "Você já tem um plano ativo"
                      ) : (profile?.duelcoins_balance ?? 0) < selectedPlan.price_duelcoins ? (
                        "Saldo insuficiente"
                      ) : (
                        <>Comprar por {selectedPlan.price_duelcoins} DuelCoins</>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>

          {/* Store Access Card */}
          <Card className="card-mystic border-primary/50">
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-2">
                <StoreIcon className="w-6 h-6 text-primary" />
                Loja Externa
              </CardTitle>
              <CardDescription>Visite nossa loja oficial para produtos físicos e virtuais</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <p className="text-muted-foreground">Na nossa loja você encontra planos personalizados, moedas do game e muito mais</p>
                <Button onClick={handleStoreAccess} className="w-full btn-mystic" size="lg">
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
                  <a href={`mailto:${supportEmail}`} className="text-primary hover:underline font-medium">
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
