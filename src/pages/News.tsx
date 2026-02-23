/**
 * DuelVerse - Notícias
 * Desenvolvido por Vinícius
 * 
 * Feed de notícias e atualizações da plataforma.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Newspaper } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function News() {
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNews, setSelectedNews] = useState<any>(null);

  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    try {
      console.log('📰 Buscando notícias...');
      
      const { data, error } = await supabase
        .from('news')
        .select(`
          *,
          author:profiles!news_author_id_fkey(username)
        `)
        .order('created_at', { ascending: false });

      console.log('📥 Notícias recebidas:', data);
      console.log('❌ Erro:', error);

      if (error) {
        console.error('Erro ao buscar notícias:', error);
        // Tentar buscar sem o join se houver erro
        const { data: simpleData, error: simpleError } = await supabase
          .from('news')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (!simpleError && simpleData) {
          console.log('✅ Notícias carregadas sem join:', simpleData);
          setNews(simpleData);
        }
      } else if (data) {
        console.log('✅ Notícias carregadas:', data.length);
        setNews(data);
      }
    } catch (error) {
      console.error('❌ Erro inesperado:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2 mb-2">
            <Newspaper className="w-8 h-8 text-primary" />
            Notícias
          </h1>
          <p className="text-muted-foreground">
            Fique por dentro das últimas novidades e atualizações
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-48 w-full" />
                <CardContent className="p-4">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-2" />
                  <Skeleton className="h-4 w-1/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : news.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {news.map((item) => (
              <Card
                key={item.id}
                className="overflow-hidden cursor-pointer hover:border-primary/60 transition-all group"
                onClick={() => setSelectedNews(item)}
              >
                {item.image_url && (
                  <div className="h-48 w-full overflow-hidden">
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                )}
                <CardContent className="p-4">
                  <h3 className="font-semibold text-lg line-clamp-2 mb-2 group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    {new Date(item.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                  {item.author && (
                    <Badge variant="outline" className="text-xs">
                      {item.author.username}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <Newspaper className="w-16 h-16 mx-auto mb-4 opacity-50 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">Nenhuma notícia disponível</h3>
            <p className="text-muted-foreground">
              As notícias aparecerão aqui assim que forem publicadas
            </p>
          </div>
        )}
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
