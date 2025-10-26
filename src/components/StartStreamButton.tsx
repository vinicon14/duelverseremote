import { useState, useEffect } from "react";
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
  const [hasActiveStream, setHasActiveStream] = useState(false);

  useEffect(() => {
    checkExistingStream();
  }, [duelId]);

  const checkExistingStream = async () => {
    try {
      const { data, error } = await supabase
        .from('live_streams')
        .select('id')
        .eq('duel_id', duelId)
        .eq('status', 'active')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      setHasActiveStream(!!data);
    } catch (error: any) {
      console.error('Erro ao verificar stream:', error);
    }
  };

  const startStream = async () => {
    setLoading(true);
    try {
      // Verificar novamente se já existe stream ativa
      const { data: existingStream } = await supabase
        .from('live_streams')
        .select('id')
        .eq('duel_id', duelId)
        .eq('status', 'active')
        .maybeSingle();

      if (existingStream) {
        toast.error("Já existe uma transmissão ativa para este duelo");
        setHasActiveStream(true);
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-live-stream', {
        body: {
          match_id: duelId,
          duel_id: duelId,
          tournament_id: tournamentId,
          recording_enabled: true,
          featured: !!tournamentId,
        }
      });

      if (error) throw error;

      toast.success("🎥 Transmissão iniciada!");
      setHasActiveStream(true);
      
      if (onStreamStarted && data?.stream_id) {
        onStreamStarted(data.stream_id);
      }
    } catch (error: any) {
      console.error('Erro ao iniciar stream:', error);
      if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
        toast.error("Já existe uma transmissão ativa para este duelo");
        setHasActiveStream(true);
      } else {
        toast.error("Erro ao iniciar transmissão: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={startStream}
      disabled={loading || hasActiveStream}
      className="btn-mystic text-white"
      variant="default"
      size="sm"
      title={hasActiveStream ? "Já existe uma transmissão ativa" : "Iniciar transmissão"}
    >
      {loading ? (
        <>
          <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
          <span className="hidden sm:inline">Iniciando...</span>
        </>
      ) : hasActiveStream ? (
        <>
          <Video className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="ml-1 hidden sm:inline">Ao Vivo</span>
        </>
      ) : (
        <>
          <Video className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="ml-1 hidden sm:inline">Stream</span>
        </>
      )}
    </Button>
  );
};