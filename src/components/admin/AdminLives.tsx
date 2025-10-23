import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Clapperboard, Power } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function AdminLives() {
  const [lives, setLives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchLives();
  }, []);

  const fetchLives = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('lives')
        .select('*, duel:live_duels(room_name)')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLives(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar transmissões",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const endLiveStream = async (liveId: string) => {
    try {
      const { error } = await supabase.functions.invoke('end-live-stream', {
        body: { live_id: liveId },
      });

      if (error) throw error;

      toast({
        title: "Transmissão encerrada!",
        description: "A sala foi fechada e o status foi atualizado.",
      });
      fetchLives(); // Re-fetch the list
    } catch (error: any) {
      toast({
        title: "Erro ao encerrar transmissão",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="card-mystic">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clapperboard />
          Gerenciar Transmissões ao Vivo
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : lives.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Nenhuma transmissão ao vivo no momento.
          </p>
        ) : (
          <div className="space-y-4">
            {lives.map((live) => (
              <div key={live.id} className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
                <div>
                  <p className="font-semibold">{live.duel?.room_name || 'Duelo sem nome'}</p>
                  <a
                    href={live.daily_room_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    {live.daily_room_url}
                  </a>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Power className="mr-2 h-4 w-4" />
                      Encerrar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação encerrará a transmissão ao vivo e fechará a sala para todos os participantes. Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => endLiveStream(live.id)}>
                        Confirmar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
