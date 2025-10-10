import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { NewsCard } from "@/components/NewsCard";
import { AdBanner } from "@/components/AdBanner";
import { useAccountType } from "@/hooks/useAccountType";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Newspaper, Zap, Swords, Trophy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();
  const [news, setNews] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNews, setSelectedNews] = useState<any>(null);
  const { isPro } = useAccountType();

  useEffect(() => {
    fetchNews();
    fetchAds();
  }, []);

  useEffect(() => {
    if (isPro) {
      // Limpar anúncios se for PRO
      setAds([]);
    } else {
      // Buscar anúncios se não for PRO
      fetchAds();
    }
  }, [isPro]);

  const fetchNews = async () => {
    const { data, error } = await supabase
      .from('news')
      .select('*, author:profiles!news_author_id_fkey(username)')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!error && data) {
      setNews(data);
    }
    setLoading(false);
  };

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
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-8">
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

        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <Newspaper className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gradient-mystic">Notícias</h1>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">
            Fique por dentro das últimas novidades da plataforma
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-64 w-full" />
                ))}
              </div>
            ) : news.length > 0 ? (
              <div className="space-y-6">
                {news.map((item) => (
                  <NewsCard 
                    key={item.id} 
                    news={item}
                    onClick={() => setSelectedNews(item)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Newspaper className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>Nenhuma notícia publicada ainda</p>
              </div>
            )}
          </div>

          {!isPro && ads.length > 0 && (
            <div className="lg:col-span-1">
              <h2 className="text-xl font-semibold mb-4">Anúncios</h2>
              <div className="space-y-4 sticky top-24">
                {ads.map((ad) => (
                  <AdBanner key={ad.id} ad={ad} />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <Dialog open={!!selectedNews} onOpenChange={() => setSelectedNews(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl text-gradient-mystic">
              {selectedNews?.title}
            </DialogTitle>
            <DialogDescription>
              {selectedNews && new Date(selectedNews.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
              })}
            </DialogDescription>
          </DialogHeader>
          {selectedNews?.image_url && (
            <img 
              src={selectedNews.image_url} 
              alt={selectedNews.title}
              className="w-full h-64 object-cover rounded-lg"
            />
          )}
          <ScrollArea className="max-h-[60vh]">
            <div className="prose prose-invert max-w-none">
              <p className="whitespace-pre-wrap">{selectedNews?.content}</p>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
