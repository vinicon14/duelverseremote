import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Trophy, Medal, Award, TrendingUp } from "lucide-react";

const Ranking = () => {
  const { toast } = useToast();
  const [rankings, setRankings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRankings();
  }, []);

  const fetchRankings = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('points', { ascending: false })
        .order('wins', { ascending: false })
        .limit(50);

      if (error) throw error;
      setRankings(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar ranking",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (position: number) => {
    switch (position) {
      case 1:
        return <Trophy className="w-6 h-6 text-secondary" />;
      case 2:
        return <Medal className="w-6 h-6 text-muted-foreground" />;
      case 3:
        return <Award className="w-6 h-6 text-accent" />;
      default:
        return <span className="text-muted-foreground font-semibold">{position}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gradient-mystic mb-2">
            Ranking Global
          </h1>
          <p className="text-muted-foreground">
            Os melhores duelistas do Duelverse
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i} className="card-mystic animate-pulse">
                <CardContent className="h-20" />
              </Card>
            ))}
          </div>
        ) : rankings.length === 0 ? (
          <Card className="card-mystic text-center py-12">
            <TrendingUp className="w-16 h-16 mx-auto text-primary/50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Ranking Vazio</h3>
            <p className="text-muted-foreground">
              Seja o primeiro a aparecer no ranking!
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {rankings.map((player, index) => {
              const position = index + 1;
              const isTopThree = position <= 3;

              return (
                <Card
                  key={player.id}
                  className={`card-mystic hover:border-primary/40 transition-all ${
                    isTopThree ? 'border-primary/30' : ''
                  }`}
                >
                  <CardContent className="py-6">
                    <div className="flex items-center gap-6">
                      {/* Position */}
                      <div className="w-12 flex items-center justify-center">
                        {getRankIcon(position)}
                      </div>

                      {/* Avatar */}
                      <Avatar className={`${isTopThree ? 'w-16 h-16 border-2 border-primary' : 'w-14 h-14'}`}>
                        <AvatarImage src={player.avatar_url || ""} />
                        <AvatarFallback className="bg-primary/20 text-lg">
                          {player.username?.charAt(0).toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>

                      {/* Info */}
                      <div className="flex-1">
                        <h3 className={`font-semibold ${isTopThree ? 'text-lg text-gradient-mystic' : ''}`}>
                          {player.username}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span>{(player.wins || 0) + (player.losses || 0)} jogos</span>
                          {((player.wins || 0) + (player.losses || 0)) > 0 && (
                            <>
                              <span>•</span>
                              <span>{player.wins || 0}V - {player.losses || 0}D</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Pontos */}
                      <div className="text-right">
                        <div className="text-2xl font-bold text-primary">
                          {player.points || 0}
                        </div>
                        <div className="text-xs text-muted-foreground">Pontos</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default Ranking;
