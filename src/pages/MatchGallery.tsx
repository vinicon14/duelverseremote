import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import { Video, Eye, Calendar, Trash2, Loader2, Globe, Lock, Share2 } from "lucide-react";
import { ShareVideoButton } from "@/components/ShareVideoButton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useBanCheck } from "@/hooks/useBanCheck";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Recording {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  duration: number | null;
  file_size: number | null;
  created_at: string;
  views: number;
  is_public: boolean;
  profiles: {
    username: string;
    avatar_url: string | null;
  };
}

export default function MatchGallery() {
  useBanCheck();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [updatingPublic, setUpdatingPublic] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
    fetchRecordings();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
      return;
    }
    setCurrentUser(session.user);
  };

  const fetchRecordings = async () => {
    try {
      setLoading(true);
      
      // Sincronizar gravações do storage com o banco de dados automaticamente
      try {
        await supabase.rpc('sync_storage_recordings');
      } catch {
        // Ignorar erro silenciosamente - a sincronização é apenas um fallback
      }

      // Obter sessão atual
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      
      // Buscar gravações: públicas OU do próprio usuário
      let query = supabase
        .from('match_recordings')
        .select('*')
        .order('created_at', { ascending: false });

      if (userId) {
        // Usuário logado: mostra públicas + próprias
        query = query.or(`is_public.eq.true,user_id.eq.${userId}`);
      } else {
        // Não logado: apenas públicas
        query = query.eq('is_public', true);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Buscar perfis dos usuários separadamente
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((r: any) => r.user_id))];
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, username, avatar_url')
          .in('user_id', userIds);

        // Combinar dados
        const recordingsWithProfiles = data.map((recording: any) => ({
          ...recording,
          profiles: profilesData?.find((p: any) => p.user_id === recording.user_id) || {
            username: 'Usuário',
            avatar_url: null,
          },
        }));

        setRecordings(recordingsWithProfiles as any);
      } else {
        setRecordings([]);
      }
    } catch (error: any) {
      console.error('Erro ao carregar gravações:', error);
      toast({
        title: "Erro ao carregar",
        description: "Não foi possível carregar as gravações.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    
    setDeleting(true);
    try {
      // Buscar o video_url para extrair o caminho do arquivo
      const recording = recordings.find(r => r.id === deleteId);
      if (!recording) throw new Error('Gravação não encontrada');

      // Extrair o caminho do arquivo do URL
      const urlParts = recording.video_url.split('/match-recordings/');
      const filePath = urlParts[1];

      // Deletar do storage
      const { error: storageError } = await supabase.storage
        .from('match-recordings')
        .remove([filePath]);

      if (storageError) {
        console.error('Erro ao deletar arquivo:', storageError);
      }

      // Deletar do banco
      const { error: dbError } = await supabase
        .from('match_recordings')
        .delete()
        .eq('id', deleteId);

      if (dbError) throw dbError;

      toast({
        title: "Gravação excluída",
        description: "A gravação foi removida com sucesso.",
      });

      fetchRecordings();
    } catch (error: any) {
      console.error('Erro ao deletar:', error);
      toast({
        title: "Erro ao excluir",
        description: error.message || "Não foi possível excluir a gravação.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const togglePublicStatus = async (recordingId: string, currentStatus: boolean) => {
    setUpdatingPublic(recordingId);
    try {
      const { error } = await supabase
        .from('match_recordings')
        .update({ is_public: !currentStatus })
        .eq('id', recordingId);

      if (error) throw error;

      toast({
        title: currentStatus ? "Gravação privada" : "Gravação pública",
        description: currentStatus 
          ? "Agora apenas você pode assistir esta gravação."
          : "Agora todos podem assistir esta gravação.",
      });

      fetchRecordings();
    } catch (error: any) {
      console.error('Erro ao atualizar:', error);
      toast({
        title: "Erro ao atualizar",
        description: error.message || "Não foi possível atualizar a privacidade.",
        variant: "destructive",
      });
    } finally {
      setUpdatingPublic(null);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8 pt-24">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Video className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold text-gradient-mystic">Galeria de Partidas</h1>
          </div>
          <p className="text-muted-foreground">
            Assista às melhores partidas gravadas pela comunidade
          </p>
        </div>

        {recordings.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Video className="w-16 h-16 text-muted-foreground mb-4" />
              <p className="text-lg text-muted-foreground text-center">
                Nenhuma gravação disponível ainda.
              </p>
              <p className="text-sm text-muted-foreground text-center mt-2">
                Grave suas partidas e elas aparecerão aqui!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recordings.map((recording) => (
              <Card key={recording.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <div 
                  className="aspect-video bg-muted relative cursor-pointer"
                  onClick={() => navigate(`/video/${recording.id}`)}
                >
                  <video
                    src={recording.video_url}
                    className="w-full h-full object-cover"
                    preload="metadata"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <Button
                      size="lg"
                      className="gap-2"
                    >
                      <Eye className="w-5 h-5" />
                      Assistir
                    </Button>
                  </div>
                </div>
                
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{recording.title}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <span className="truncate">{recording.profiles.username}</span>
                        {recording.is_public ? (
                          <Globe className="w-3 h-3" />
                        ) : (
                          <Lock className="w-3 h-3" />
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex gap-1">
                      <ShareVideoButton
                        videoId={recording.id}
                        videoTitle={recording.title}
                        videoDescription={recording.description || undefined}
                      />
                      {currentUser?.id === recording.user_id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="flex-shrink-0"
                          onClick={() => setDeleteId(recording.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-2">
                  {recording.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {recording.description}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDistanceToNow(new Date(recording.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </div>
                    <div className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {recording.views} visualizações
                    </div>
                  </div>
                  
                  {recording.file_size && (
                    <div className="text-xs text-muted-foreground">
                      Tamanho: {formatFileSize(recording.file_size)}
                    </div>
                  )}

                  {currentUser?.id === recording.user_id && (
                    <div className="flex items-center justify-between pt-3 border-t">
                      <div className="flex items-center gap-2 text-sm">
                        {recording.is_public ? (
                          <>
                            <Globe className="w-4 h-4 text-primary" />
                            <span>Pública</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-4 h-4" />
                            <span>Privada</span>
                          </>
                        )}
                      </div>
                      <Switch
                        checked={recording.is_public}
                        onCheckedChange={() => togglePublicStatus(recording.id, recording.is_public)}
                        disabled={updatingPublic === recording.id}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir gravação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A gravação será permanentemente removida do servidor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}