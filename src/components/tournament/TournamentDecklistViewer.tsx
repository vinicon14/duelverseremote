import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Image, Loader2 } from "lucide-react";

interface DecklistEntry {
  user_id: string;
  image_url: string;
  username: string;
  avatar_url: string;
  created_at: string;
}

interface TournamentDecklistViewerProps {
  tournamentId: string;
}

export const TournamentDecklistViewer = ({ tournamentId }: TournamentDecklistViewerProps) => {
  const [decklists, setDecklists] = useState<DecklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    fetchDecklists();
  }, [tournamentId]);

  const fetchDecklists = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("tournament_decklists")
        .select("user_id, image_url, created_at")
        .eq("tournament_id", tournamentId);

      if (error) throw error;

      if (!data || data.length === 0) {
        setDecklists([]);
        setLoading(false);
        return;
      }

      // Fetch profiles
      const userIds = data.map((d: any) => d.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, username, avatar_url")
        .in("user_id", userIds);

      const profileMap: Record<string, any> = {};
      profiles?.forEach((p) => {
        profileMap[p.user_id] = p;
      });

      const entries: DecklistEntry[] = data.map((d: any) => ({
        user_id: d.user_id,
        image_url: d.image_url,
        created_at: d.created_at,
        username: profileMap[d.user_id]?.username || "Usuário",
        avatar_url: profileMap[d.user_id]?.avatar_url || "",
      }));

      setDecklists(entries);
    } catch (error) {
      console.error("Error fetching decklists:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="card-mystic">
        <CardContent className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (decklists.length === 0) {
    return (
      <Card className="card-mystic text-center py-8">
        <Image className="w-12 h-12 mx-auto text-primary/50 mb-2" />
        <p className="text-muted-foreground text-sm">Nenhuma decklist enviada</p>
      </Card>
    );
  }

  return (
    <>
      <Card className="card-mystic">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Image className="w-5 h-5" />
            Decklists Enviadas ({decklists.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {decklists.map((entry) => (
              <div
                key={entry.user_id}
                className="border rounded-lg p-3 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedImage(entry.image_url)}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={entry.avatar_url} />
                    <AvatarFallback className="bg-primary/20 text-xs">
                      {entry.username.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{entry.username}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <img
                  src={entry.image_url}
                  alt={`Decklist de ${entry.username}`}
                  className="w-full h-32 object-cover rounded-md"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-3xl p-2">
          {selectedImage && (
            <img
              src={selectedImage}
              alt="Decklist"
              className="w-full h-auto rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
