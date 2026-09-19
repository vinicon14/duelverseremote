/**
 * DuelVerse - Painel Admin
 * Desenvolvido por Vinícius
 * 
 * Interface administrativa para gerenciar usuários, notícias,
 * anúncios, torneios, juizes e configurações do sistema.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Navbar } from "@/components/Navbar";
import { useAdmin } from "@/hooks/useAdmin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminNews } from "@/components/admin/AdminNews";
import { AdminAds } from "@/components/admin/AdminAds";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { AdminTournaments } from "@/components/admin/AdminTournaments";
import { AdminSettings } from "@/components/admin/AdminSettings";
import { AdminDuels } from "@/components/admin/AdminDuels";
import { AdminDuelCoins } from "@/components/admin/AdminDuelCoins";
import { AdminJudges } from "@/components/admin/AdminJudges";
import { AdminSubscriptionPlans } from "@/components/admin/AdminSubscriptionPlans";
import { AdminMarketplace } from "@/components/admin/AdminMarketplace";
import { AdminDuelCoinsPackages } from "@/components/admin/AdminDuelCoinsPackages";
import { AdminDiscord } from "@/components/admin/AdminDiscord";
import { AdminCoupons } from "@/components/admin/AdminCoupons";
import { AdminVerifications } from "@/components/admin/AdminVerifications";
import { AdminMetrics } from "@/components/admin/AdminMetrics";
import { AdminMonetag } from "@/components/admin/AdminMonetag";
import { AdminRankingReset } from "@/components/admin/AdminRankingReset";
import { AdminBattlePass } from "@/components/admin/AdminBattlePass";
import { AdminParty } from "@/components/admin/AdminParty";
import { AdminCountries } from "@/components/admin/AdminCountries";
import { Input } from "@/components/ui/input";
import { Shield, Loader2, Search } from "lucide-react";

export default function Admin() {
  const { isAdmin, loading } = useAdmin();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [tab, setTab] = useState("metrics");
  const [query, setQuery] = useState("");

  const groups = [
    {
      title: "Visão geral",
      items: [
        { value: "metrics", label: "Métricas" },
        { value: "ranked", label: "Ranqueada" },
        { value: "battlepass", label: "Battle Pass" },
      ],
    },
    {
      title: "Conteúdo",
      items: [
        { value: "news", label: t("admin.tabs.news") },
        { value: "ads", label: t("admin.tabs.ads") },
        { value: "monetag", label: "Monetag" },
        { value: "discord", label: t("admin.tabs.discord") },
      ],
    },
    {
      title: "Comunidade",
      items: [
        { value: "users", label: t("admin.tabs.users") },
        { value: "duels", label: t("admin.tabs.duels") },
        { value: "tournaments", label: t("admin.tabs.tournaments") },
        { value: "party", label: "Partys" },
        { value: "judges", label: t("admin.tabs.judges") },
        { value: "verifications", label: "Verificações" },
      ],
    },
    {
      title: "Loja e economia",
      items: [
        { value: "marketplace", label: t("admin.tabs.marketplace") },
        { value: "duelcoins", label: t("admin.tabs.duelcoins") },
        { value: "packages", label: t("admin.tabs.packages") },
        { value: "plans", label: t("admin.tabs.plans") },
        { value: "coupons", label: "Cupons" },
      ],
    },
    {
      title: "Sistema",
      items: [{ value: "settings", label: t("admin.tabs.settings") }],
    },
  ];


  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-transparent">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-primary shrink-0" />
            <h1 className="text-2xl sm:text-4xl font-bold text-gradient-mystic">{t('admin.title')}</h1>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">
            {t('admin.subtitle')}
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar seção do painel..."
                className="pl-9"
              />
            </div>

            {groups.map((group) => {
              const items = group.items.filter((i) =>
                i.label.toLowerCase().includes(query.trim().toLowerCase())
              );
              if (items.length === 0) return null;
              return (
                <div key={group.title} className="space-y-1.5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{group.title}</p>
                  <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1 p-1">
                    {items.map((item) => (
                      <TabsTrigger key={item.value} value={item.value} className="text-xs sm:text-sm">
                        {item.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
              );
            })}
          </div>
          
          
          <TabsContent value="metrics" className="mt-6">
            <AdminMetrics />
          </TabsContent>

          <TabsContent value="monetag" className="mt-6">
            <AdminMonetag />
          </TabsContent>

          <TabsContent value="ranked" className="mt-6">
            <AdminRankingReset />
          </TabsContent>

          <TabsContent value="battlepass" className="mt-6">
            <AdminBattlePass />
          </TabsContent>

          <TabsContent value="news" className="mt-6">
            <AdminNews />
          </TabsContent>

          
          <TabsContent value="discord" className="mt-6">
            <AdminDiscord />
          </TabsContent>
          
          <TabsContent value="ads" className="mt-6">
            <AdminAds />
          </TabsContent>
          
          <TabsContent value="users" className="mt-6">
            <AdminUsers />
          </TabsContent>
          
          <TabsContent value="duels" className="mt-6">
            <AdminDuels />
          </TabsContent>
          
          <TabsContent value="tournaments" className="mt-6">
            <AdminTournaments />
          </TabsContent>
          
          <TabsContent value="duelcoins" className="mt-6">
            <AdminDuelCoins />
          </TabsContent>
          
          <TabsContent value="packages" className="mt-6">
            <AdminDuelCoinsPackages />
          </TabsContent>

          <TabsContent value="judges" className="mt-6">
            <AdminJudges />
          </TabsContent>
          
          <TabsContent value="plans" className="mt-6 overflow-x-auto">
            <AdminSubscriptionPlans />
          </TabsContent>
          
          <TabsContent value="marketplace" className="mt-6">
            <AdminMarketplace />
          </TabsContent>

          <TabsContent value="coupons" className="mt-6">
            <AdminCoupons />
          </TabsContent>

          <TabsContent value="verifications" className="mt-6">
            <AdminVerifications />
          </TabsContent>

          <TabsContent value="settings" className="mt-6">
            <AdminSettings />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

