// src/components/admin/AdminLives.tsx
import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, VideoOff } from "lucide-react";

interface LiveStream {
  id: string;
  daily_room_url: string;
  match_id: string;
  status: string;
}

export const AdminLives: React.FC = () => {
  const [lives, setLives] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchLives();
  }, []);

  const fetchLives = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("lives")
      .select("*")
      .eq("status", "active");

    if (error) {
      toast({
        title: "Erro ao buscar transmissões",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setLives(data || []);
    }
    setLoading(false);
  };

  const endLiveStream = async (live: LiveStream) => {
    try {
      const roomName = live.daily_room_url.split("/").pop();
      if (!roomName) {
        throw new Error("Invalid room URL");
      }

      const { error } = await supabase.functions.invoke("end-live-room", {
        body: { room_name: roomName, live_id: live.id },
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Transmissão encerrada!",
        description: "A transmissão foi encerrada com sucesso.",
      });
      fetchLives();
    } catch (error: any) {
      toast({
        title: "Erro ao encerrar a transmissão",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <Loader2 className="w-8 h-8 animate-spin text-primary" />;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Transmissões Ativas</h2>
      {lives.length === 0 ? (
        <p>Nenhuma transmissão ativa no momento.</p>
      ) : (
        <div className="space-y-4">
          {lives.map((live) => (
            <div key={live.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-semibold">Match ID: {live.match_id}</p>
                <a href={live.daily_room_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                  {live.daily_room_url}
                </a>
              </div>
              <Button onClick={() => endLiveStream(live)} variant="destructive">
                <VideoOff className="mr-2 h-4 w-4" />
                Encerrar
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
