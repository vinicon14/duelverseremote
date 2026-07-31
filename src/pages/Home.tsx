/**
 * DuelVerse - Página Inicial
 * Desenvolvido por Vinícius
 * 
 * Dashboard principal do aplicativo.
 * Exibe Quick Play, torneios e saldo de DuelCoins.
 */
import { Navbar } from "@/components/Navbar";
import { Zap, Swords, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DuelCoinsBalance } from "@/components/DuelCoinsBalance";
import { DailyXpClaim } from "@/components/DailyXpClaim";
import { useTranslation } from "react-i18next";

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <SidebarProvider defaultOpen>
      <div className="h-[100dvh] overflow-hidden bg-transparent flex w-full">
        <Navbar />
        
        <main className="flex-1 container max-w-5xl mx-auto px-4 pt-20 pb-4 h-[100dvh] overflow-y-auto md:overflow-hidden flex flex-col justify-center">
        <h1 className="sr-only">{t('home.quickMatchTitle')} - Duelverse</h1>
        <div className="flex flex-col md:flex-row gap-4 md:gap-6">
          {/* Quick Match - HERO SECTION */}
          <Card className="card-mystic hover:border-primary/40 transition-all cursor-pointer animate-fade-in-up delay-100 flex-1 group" onClick={() => navigate('/matchmaking')}>
            <CardContent className="p-6 md:p-10 flex flex-col items-center justify-center text-center h-full relative">

              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-xl"></div>
              <div className="p-3 rounded-full bg-primary/10 mb-4 group-hover:scale-110 transition-transform duration-500">
                <Zap className="w-10 h-10 text-primary animate-breathe" />
              </div>
              <h2 className="text-2xl md:text-3xl font-black tracking-wider uppercase mb-2">{t('home.quickMatchTitle')}</h2>
              <p className="text-sm text-muted-foreground mb-5 max-w-sm">{t('home.quickMatchDesc')}</p>

              <Button className="w-full sm:w-auto min-w-[240px] h-12 text-lg uppercase font-bold tracking-widest shadow-[0_0_20px_-5px_hsl(var(--primary))]">
                {t('home.quickMatchBtn')}
              </Button>
            </CardContent>
          </Card>

          {/* Lateral Column */}
          <div className="flex flex-col gap-6 md:w-[320px]">
            {/* Saldo de DuelCoins reestilizado lateral */}
            <div className="animate-fade-in-up">
              <DuelCoinsBalance />
            </div>

            <div className="animate-fade-in-up delay-100">
              <DailyXpClaim />
            </div>


            <Card className="card-mystic hover:border-primary/30 transition-all cursor-pointer animate-fade-in-up delay-200 group" onClick={() => navigate('/duels')}>
              <CardContent className="p-6 flex flex-col items-start h-full">
                <Swords className="w-6 h-6 text-primary mb-4 opacity-80 group-hover:opacity-100 transition-opacity" />
                <h3 className="text-xl font-bold mb-2">{t('home.duelsTitle')}</h3>
                <p className="text-sm text-muted-foreground mb-4 flex-1">{t('home.duelsDesc')}</p>
                <Button variant="ghost" className="w-full justify-between hover:bg-primary/10 group-hover:text-primary">
                  {t('home.duelsBtn')} <Swords className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>

            <Card className="card-mystic hover:border-primary/30 transition-all cursor-pointer animate-fade-in-up delay-300 group" onClick={() => navigate('/tournaments')}>
              <CardContent className="p-6 flex flex-col items-start h-full">
                <Trophy className="w-6 h-6 text-primary mb-4 opacity-80 group-hover:opacity-100 transition-opacity" />
                <h3 className="text-xl font-bold mb-2">{t('home.tournamentsTitle')}</h3>
                <p className="text-sm text-muted-foreground mb-4 flex-1">{t('home.tournamentsDesc')}</p>
                <Button variant="ghost" className="w-full justify-between hover:bg-primary/10 group-hover:text-primary">
                  {t('home.tournamentsBtn')} <Trophy className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

      </main>
    </div>
    </SidebarProvider>
  );
}
