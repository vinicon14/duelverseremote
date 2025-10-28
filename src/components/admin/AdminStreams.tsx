import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Eye, Users, Video, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
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

interface LiveStream {
  id: string;
  duel_id: string | null;
  tournament_id: string | null;
  match_id: string | null;
  viewers_count: number;
  recording_enabled: boolean;
  featured: boolean;
  status: string;
  started_at: string;
  ended_at: string | null;
  daily_room_name: string;
  daily_room_url: string;
}

export const AdminStreams = () => {
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchStreams = async () => {
    try {
      const { data, error } = await supabase
        .from('live_streams')
        .select('*')
        .order('started_at', { ascending: false });

      if (error) throw error;
      setStreams(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar streams",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStreams();

    // Realtime subscription
    const channel = supabase
      .channel('admin-streams')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_streams' }, () => {
        fetchStreams();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleEndStream = async () => {
    if (!selectedStreamId) return;

    try {
      // Chamar edge function para encerrar stream
      const { error } = await supabase.functions.invoke('end-live-stream', {
        body: { stream_id: selectedStreamId }
      });

      if (error) throw error;

      toast({
        title: "Stream encerrada",
        description: "A transmissão foi encerrada com sucesso.",
      });

      setDeleteDialogOpen(false);
      setSelectedStreamId(null);
    } catch (error: any) {
      toast({
        title: "Erro ao encerrar stream",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; class: string }> = {
      active: { label: 'Ao Vivo', class: 'bg-red-500/20 text-red-500 animate-pulse' },
      ended: { label: 'Encerrada', class: 'bg-gray-500/20 text-gray-500' },
    };
    const badge = badges[status] || badges.active;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.class}`}>
        {badge.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando streams...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Gerenciar Live Streams</h2>
          <p className="text-muted-foreground">
            {streams.filter(s => s.status === 'active').length} {streams.filter(s => s.status === 'active').length === 1 ? 'stream ativa' : 'streams ativas'}
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        {streams.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Nenhuma stream no momento.
            </CardContent>
          </Card>
        ) : (
          streams.map((stream) => (
            <Card key={stream.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Video className="w-5 h-5" />
                      {stream.featured && '⭐ '}
                      Live Stream
                      {getStatusBadge(stream.status)}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      ID: {stream.id.slice(0, 8)}... | Room: {stream.daily_room_name}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/stream/${stream.id}`)}
                      disabled={stream.status !== 'active'}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Assistir
                    </Button>
                    {stream.status === 'active' && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setSelectedStreamId(stream.id);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Encerrar
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{stream.viewers_count} espectadores</span>
                      </div>
                      {stream.recording_enabled && (
                        <span className="px-2 py-1 rounded-full text-xs bg-red-500/20 text-red-500">
                          🔴 Gravando
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">
                        {new Date(stream.started_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                  {stream.duel_id && (
                    <div className="text-sm text-muted-foreground">
                      🎮 Stream de duelo: {stream.duel_id.slice(0, 8)}...
                    </div>
                  )}
                  {stream.tournament_id && (
                    <div className="text-sm text-muted-foreground">
                      🏆 Stream de torneio: {stream.tournament_id.slice(0, 8)}...
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar stream?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação encerrará a transmissão ao vivo e desconectará todos os espectadores. 
              A sala do Daily.co será excluída.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleEndStream} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Encerrar Stream
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
