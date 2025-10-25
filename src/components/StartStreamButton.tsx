import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Video, Loader2 } from "lucide-react";

interface StartStreamButtonProps {
  duelId: string;
  tournamentId?: string;
  onStreamStarted?: (streamId: string) => void;
}

export const StartStreamButton = ({ duelId, tournamentId, onStreamStarted }: StartStreamButtonProps) => {
  const [loading, setLoading] = useState(false);

  const startStream = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-live-stream', {
        body: {
          match_id: duelId,
          tournament_id: tournamentId,
          recording_enabled: true,
          featured: true,
        }
      });

      if (error) throw error;

      toast.success("🎥 Transmissão iniciada!");
      
      if (onStreamStarted && data?.stream_id) {
        onStreamStarted(data.stream_id);
      }
    } catch (error: any) {
      console.error('Erro ao iniciar stream:', error);
      toast.error("Erro ao iniciar transmissão: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={startStream}
      disabled={loading}
      className="btn-mystic text-white"
      variant="default"
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Iniciando...
        </>
      ) : (
        <>
          <Video className="w-4 h-4 mr-2" />
          Iniciar Transmissão
        </>
      )}
    </Button>
  );
};