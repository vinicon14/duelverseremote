import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Eye, Calendar, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareVideoButton } from "@/components/ShareVideoButton";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useBanCheck } from "@/hooks/useBanCheck";

interface Recording {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  video_url: string;
  created_at: string;
  views: number;
  is_public: boolean;
  profiles: {
    username: string;
    avatar_url: string | null;
  };
}

export default function VideoShare() {
  useBanCheck();
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    checkAuth();
    fetchRecording();
  }, [id]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setCurrentUser(session?.user || null);
  };

  const fetchRecording = async () => {
    if (!id) return;

    try {
      setLoading(true);
      
      // Buscar gravação
      const { data: recordingData, error: recordingError } = await supabase
        .from('match_recordings')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (recordingError) throw recordingError;

      if (!recordingData) {
        toast({
          title: "Vídeo não encontrado",
          description: "Este vídeo não existe ou foi removido.",
          variant: "destructive",
        });
        navigate('/match-gallery');
        return;
      }

      // Buscar perfil do usuário
      const { data: profileData } = await supabase
        .from('profiles')
        .select('user_id, username, avatar_url')
        .eq('user_id', recordingData.user_id)
        .single();

      const recordingWithProfile = {
        ...recordingData,
        profiles: profileData || {
          username: 'Usuário',
          avatar_url: null,
        },
      };

      setRecording(recordingWithProfile as any);

      // Incrementar visualizações
      await supabase
        .from('match_recordings')
        .update({ views: (recordingData.views || 0) + 1 })
        .eq('id', id);

    } catch (error: any) {
      console.error('Erro ao carregar vídeo:', error);
      toast({
        title: "Erro ao carregar",
        description: "Não foi possível carregar o vídeo.",
        variant: "destructive",
      });
      navigate('/match-gallery');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  if (!recording) {
    return null;
  }

  // Verificar se o usuário tem permissão para visualizar
  const canView = recording.is_public || currentUser?.id === recording.user_id;

  if (!canView) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <Card className="max-w-2xl mx-auto">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Eye className="w-16 h-16 text-muted-foreground mb-4" />
              <h2 className="text-2xl font-bold mb-2">Vídeo Privado</h2>
              <p className="text-muted-foreground text-center">
                Este vídeo é privado e você não tem permissão para visualizá-lo.
              </p>
              <Button
                onClick={() => navigate('/match-gallery')}
                className="mt-4"
              >
                Voltar para a Galeria
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Video Player */}
          <div className="aspect-video bg-black rounded-lg overflow-hidden mb-6">
            <video
              src={recording.video_url}
              controls
              autoPlay
              className="w-full h-full"
            />
          </div>

          {/* Video Info */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex-1">
                  <CardTitle className="text-2xl mb-2">{recording.title}</CardTitle>
                  <CardDescription className="flex items-center gap-2 text-base">
                    <User className="w-4 h-4" />
                    <span>{recording.profiles.username}</span>
                    <span>•</span>
                    <Eye className="w-4 h-4" />
                    <span>{recording.views} visualizações</span>
                  </CardDescription>
                </div>
                <ShareVideoButton
                  videoId={recording.id}
                  videoTitle={recording.title}
                  videoDescription={recording.description || undefined}
                />
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {recording.description && (
                <div>
                  <h3 className="font-semibold mb-2">Descrição</h3>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {recording.description}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 text-sm text-muted-foreground pt-4 border-t">
                <Calendar className="w-4 h-4" />
                Publicado {formatDistanceToNow(new Date(recording.created_at), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </div>

              <div className="pt-4 border-t">
                <Button
                  onClick={() => navigate('/match-gallery')}
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  Ver Mais Vídeos
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* DuelVerse Branding */}
          <div className="mt-8 text-center">
            <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-primary/20 to-purple-500/20 border border-primary/30">
              <span className="text-2xl">💎</span>
              <span className="font-bold text-gradient-mystic">DuelVerse</span>
              <span className="text-sm text-muted-foreground">- A melhor plataforma de duelos</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
