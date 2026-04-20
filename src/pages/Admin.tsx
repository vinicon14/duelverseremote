/**
 * DuelVerse - Painel Admin
 * Desenvolvido por Vinícius
 * 
 * Interface administrativa para gerenciar usuários, notícias,
 * anúncios, torneios, juizes e configurações do sistema.
 */
import { useEffect } from "react";
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
import { Shield, Loader2 } from "lucide-react";

export default function Admin() {
  const { isAdmin, loading } = useAdmin();
  const navigate = useNavigate();
  const { t } = useTranslation();

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
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-primary shrink-0" />
            <h1 className="text-2xl sm:text-4xl font-bold text-gradient-mystic">{t('admin.title')}</h1>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">
            {t('admin.subtitle')}
          </p>
        </div>

        <Tabs defaultValue="news" className="w-full">
          <div className="overflow-x-auto -mx-4 px-4 pb-2">
            <TabsList className="flex w-max sm:w-full overflow-x-auto gap-1">
            <TabsTrigger value="news">{t('admin.tabs.news')}</TabsTrigger>
              <TabsTrigger value="discord">{t('admin.tabs.discord')}</TabsTrigger>
            <TabsTrigger value="ads">{t('admin.tabs.ads')}</TabsTrigger>
            <TabsTrigger value="users">{t('admin.tabs.users')}</TabsTrigger>
            <TabsTrigger value="duels">{t('admin.tabs.duels')}</TabsTrigger>
            <TabsTrigger value="tournaments">{t('admin.tabs.tournaments')}</TabsTrigger>
            <TabsTrigger value="duelcoins">{t('admin.tabs.duelcoins')}</TabsTrigger>
            <TabsTrigger value="packages">{t('admin.tabs.packages')}</TabsTrigger>
            <TabsTrigger value="judges">{t('admin.tabs.judges')}</TabsTrigger>
            <TabsTrigger value="plans">{t('admin.tabs.plans')}</TabsTrigger>
            <TabsTrigger value="marketplace">{t('admin.tabs.marketplace')}</TabsTrigger>
            <TabsTrigger value="settings">{t('admin.tabs.settings')}</TabsTrigger>
            </TabsList>
          </div>
          
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

          <TabsContent value="settings" className="mt-6">
            <AdminSettings />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

