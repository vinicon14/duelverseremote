/**
 * DuelVerse - Página Inicial
 * Desenvolvido por Vinícius
 * 
 * Dashboard principal do aplicativo.
 * Exibe Quick Play, torneios, saldo de DuelCoins e anúncios.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { AdBanner } from "@/components/AdBanner";
import { GoogleAdBanner } from "@/components/GoogleAdBanner";
import { useAccountType } from "@/hooks/useAccountType";
import { Zap, Swords, Trophy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DuelCoinsBalance } from "@/components/DuelCoinsBalance";

export default function Home() {
  const navigate = useNavigate();
  const [ads, setAds] = useState<any[]>([]);
  const { isPro } = useAccountType();

  useEffect(() => {
    fetchAds();
  }, []);

  useEffect(() => {
    if (isPro) {
      setAds([]);
    } else {
      fetchAds();
    }
  }, [isPro]);

  const fetchAds = async () => {
    const { data, error } = await supabase
      .from('advertisements')
      .select('*')
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .limit(3);

    if (!error && data) {
      setAds(data);
    }
  };

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen bg-background flex w-full">
        <Navbar />
        
        <main className="flex-1 container mx-auto px-4 pt-20 sm:pt-24 pb-8">
        {/* Google Ad Banner Topo */}
        {!isPro && (
          <GoogleAdBanner slot="1234567890" className="mb-6" />
        )}

        {/* Saldo de DuelCoins */}
        <div className="mb-6">
          <DuelCoinsBalance />
        </div>

        {/* Cards de Acesso Rápido */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card className="card-mystic hover:border-primary/60 transition-all cursor-pointer" onClick={() => navigate('/matchmaking')}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="w-5 h-5 text-primary" />
                Fila Rápida
              </CardTitle>
              <CardDescription>Encontre um oponente agora</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full btn-mystic">
                <Zap className="w-4 h-4 mr-2" />
                Buscar Partida
              </Button>
            </CardContent>
          </Card>

          <Card className="card-mystic hover:border-primary/60 transition-all cursor-pointer" onClick={() => navigate('/duels')}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Swords className="w-5 h-5 text-primary" />
                Duelos
              </CardTitle>
              <CardDescription>Crie ou entre em salas</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                <Swords className="w-4 h-4 mr-2" />
                Ver Salas
              </Button>
            </CardContent>
          </Card>

          <Card className="card-mystic hover:border-primary/60 transition-all cursor-pointer" onClick={() => navigate('/tournaments')}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Trophy className="w-5 h-5 text-primary" />
                Torneios
              </CardTitle>
              <CardDescription>Competições oficiais</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                <Trophy className="w-4 h-4 mr-2" />
                Ver Torneios
              </Button>
            </CardContent>
          </Card>
        </div>

        {!isPro && ads.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Anúncios</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {ads.map((ad) => (
                <AdBanner key={ad.id} ad={ad} />
              ))}
            </div>
          </div>
        )}

        {/* Google Ad Banner Meio */}
        {!isPro && (
          <GoogleAdBanner slot="1234567891" className="my-6" />
        )}
      </main>
      </div>
    </SidebarProvider>
  );
}
