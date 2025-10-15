import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Eye, Users, Clock } from "lucide-react";
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

interface LiveDuel {
  id: string;
  creator_id: string;
  opponent_id: string | null;
  status: string;
  is_ranked: boolean;
  player1_lp: number;
  player2_lp: number;
  created_at: string;
  started_at: string | null;
  remaining_seconds: number | null;
  creator?: {
    username: string;
    avatar_url: string;
  };
  opponent?: {
    username: string;
    avatar_url: string;
  };
}

export const AdminDuels = () => {
  const [duels, setDuels] = useState<LiveDuel[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDuelId, setSelectedDuelId] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchDuels = async () => {
    try {
      const { data, error } = await supabase
        .from('live_duels')
        .select(`
          *,
          creator:profiles!live_duels_creator_id_fkey(username, avatar_url),
          opponent:profiles!live_duels_opponent_id_fkey(username, avatar_url)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDuels(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar salas",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDuels();

    // Realtime subscription
    const channel = supabase
      .channel('admin-duels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_duels' }, () => {
        fetchDuels();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleDeleteDuel = async () => {
    if (!selectedDuelId) return;

    try {
      const { error } = await supabase
        .from('live_duels')
        .delete()
        .eq('id', selectedDuelId);

      if (error) throw error;

      toast({
        title: "Sala excluída",
        description: "A sala foi removida com sucesso.",
      });

      setDeleteDialogOpen(false);
      setSelectedDuelId(null);
    } catch (error: any) {
      toast({
        title: "Erro ao excluir sala",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatTime = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; class: string }> = {
      waiting: { label: 'Aguardando', class: 'bg-yellow-500/20 text-yellow-500' },
      in_progress: { label: 'Em Andamento', class: 'bg-green-500/20 text-green-500' },
      finished: { label: 'Finalizado', class: 'bg-gray-500/20 text-gray-500' },
    };
    const badge = badges[status] || badges.waiting;
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
          <p className="text-muted-foreground">Carregando salas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Gerenciar Salas</h2>
          <p className="text-muted-foreground">
            {duels.length} {duels.length === 1 ? 'sala ativa' : 'salas ativas'}
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        {duels.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Nenhuma sala ativa no momento.
            </CardContent>
          </Card>
        ) : (
          duels.map((duel) => (
            <Card key={duel.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {duel.is_ranked ? '🏆 Ranqueada' : '🎮 Casual'}
                      {getStatusBadge(duel.status)}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      ID: {duel.id.slice(0, 8)}...
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/duel/${duel.id}`)}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Assistir
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setSelectedDuelId(duel.id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">
                        {duel.creator?.username || 'Player 1'}
                        {duel.opponent ? ` vs ${duel.opponent.username}` : ' (aguardando oponente)'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-mono">
                        {formatTime(duel.remaining_seconds)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>LP: {duel.player1_lp} vs {duel.player2_lp}</span>
                    <span className="text-muted-foreground">
                      Criada {new Date(duel.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir sala?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A sala será removida permanentemente e os jogadores serão desconectados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDuel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
