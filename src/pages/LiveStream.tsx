import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function LiveStream() {
  const { duelId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!duelId) {
      navigate('/duels');
      return;
    }

    const fetchOrCreateLiveStream = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase.functions.invoke('create-live-stream', {
          body: { duel_id: duelId },
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        setRoomUrl(data.live.daily_room_url);
      } catch (error: any) {
        toast({
          title: "Erro ao carregar transmissão",
          description: error.message,
          variant: "destructive",
        });
        navigate('/duels');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrCreateLiveStream();
  }, [duelId, navigate, toast]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="px-2 sm:px-4 pt-16 sm:pt-20 pb-2 sm:pb-4">
        <div className="h-[calc(100vh-80px)] sm:h-[calc(100vh-100px)] relative">
          <div className="h-full w-full rounded-lg overflow-hidden bg-card shadow-2xl border border-primary/20">
            {isLoading || !roomUrl ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center space-y-4">
                  <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
                  <p className="text-muted-foreground">Carregando transmissão ao vivo...</p>
                </div>
              </div>
            ) : (
              <iframe
                src={roomUrl}
                allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
                className="w-full h-full"
                title="Transmissão ao Vivo - Daily.co"
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
