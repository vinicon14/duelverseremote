import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { Loader2, Swords, Users } from "lucide-react";
import { toast } from "sonner";

export default function Matchmaking() {
  const navigate = useNavigate();
  const [searching, setSearching] = useState(false);
  const [queueId, setQueueId] = useState<string | null>(null);
  const [estimatedWait, setEstimatedWait] = useState<number | null>(null);
  const [playersInQueue, setPlayersInQueue] = useState(0);

  useEffect(() => {
    checkAuth();
    fetchQueueStats();
  }, []);

  useEffect(() => {
    if (searching && queueId) {
      const matchCheckInterval = setInterval(() => {
        checkForMatch();
      }, 2000);

      return () => clearInterval(matchCheckInterval);
    }
  }, [searching, queueId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchQueueStats = async () => {
    const { count } = await supabase
      .from("matchmaking_queues")
      .select("*", { count: "exact", head: true })
      .eq("queue_status", "searching");
    
    setPlayersInQueue(count || 0);
  };

  const joinQueue = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Verificar se o usuário já está em algum duelo ativo
    const { data: existingDuels } = await supabase
      .from("live_duels")
      .select("id, status")
      .or(`player1_id.eq.${session.user.id},player2_id.eq.${session.user.id}`)
      .in("status", ["waiting", "active"]);

    if (existingDuels && existingDuels.length > 0) {
      toast.error("Você já está em um duelo ativo. Termine-o antes de buscar outro.");
      navigate(`/duel/${existingDuels[0].id}`);
      return;
    }

    // Verificar se o usuário já está na fila
    const { data: queueCheck } = await supabase
      .from("matchmaking_queues")
      .select("id")
      .eq("player_id", session.user.id)
      .eq("queue_status", "searching");

    if (queueCheck && queueCheck.length > 0) {
      toast.error("Você já está na fila de matchmaking.");
      return;
    }

    // Get user's ELO
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("elo_rating")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (profileError) {
      toast.error("Erro ao carregar perfil: " + profileError.message);
      return;
    }

    if (!profile) {
      toast.error("Perfil não encontrado. Por favor, faça logout e login novamente.");
      return;
    }

    // Add to queue
    const { data: queueEntry, error } = await supabase
      .from("matchmaking_queues")
      .insert({
        player_id: session.user.id,
        elo_rating: profile.elo_rating,
        queue_status: "searching",
        estimated_wait_time: 30
      })
      .select()
      .single();

    if (error) {
      toast.error("Failed to join queue");
      console.error(error);
      return;
    }

    setQueueId(queueEntry.id);
    setSearching(true);
    setEstimatedWait(30);
    toast.success("Searching for opponent...");
    
    // Try to find a match immediately
    await findMatch(session.user.id, profile.elo_rating);
  };

  const findMatch = async (playerId: string, playerElo: number) => {
    // Look for opponents in queue with similar ELO (±200)
    const { data: opponents } = await supabase
      .from("matchmaking_queues")
      .select("*")
      .eq("queue_status", "searching")
      .neq("player_id", playerId)
      .gte("elo_rating", playerElo - 200)
      .lte("elo_rating", playerElo + 200)
      .order("queue_time", { ascending: true })
      .limit(1);

    if (opponents && opponents.length > 0) {
      const opponent = opponents[0];
      
      // Create duel
      const { data: duel, error: duelError } = await supabase
        .from("live_duels")
        .insert({
          player1_id: playerId,
          player2_id: opponent.player_id,
          status: "active",
          room_name: `Duel ${Date.now()}`
        })
        .select()
        .single();

      if (duelError) {
        console.error("Error creating duel:", duelError);
        return;
      }

      // Remove both players from queue
      await supabase
        .from("matchmaking_queues")
        .delete()
        .in("player_id", [playerId, opponent.player_id]);

      // Navigate to duel room
      toast.success("Match found!");
      navigate(`/duel/${duel.id}`);
    }
  };

  const checkForMatch = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Check if we're in a duel
    const { data: duels } = await supabase
      .from("live_duels")
      .select("id")
      .or(`player1_id.eq.${session.user.id},player2_id.eq.${session.user.id}`)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1);

    if (duels && duels.length > 0) {
      navigate(`/duel/${duels[0].id}`);
    }
  };

  const cancelSearch = async () => {
    if (!queueId) return;

    await supabase
      .from("matchmaking_queues")
      .delete()
      .eq("id", queueId);

    setSearching(false);
    setQueueId(null);
    setEstimatedWait(null);
    toast.info("Search cancelled");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold gradient-text">Matchmaking</h1>
            <p className="text-muted-foreground">Find your next opponent</p>
          </div>

          <Card className="card-mystic p-8">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Players in queue: <span className="font-bold text-foreground">{playersInQueue}</span>
                  </span>
                </div>
              </div>

              {!searching ? (
                <div className="space-y-4">
                  <div className="text-center py-8">
                    <Swords className="h-16 w-16 mx-auto mb-4 text-primary animate-pulse" />
                    <h3 className="text-xl font-semibold mb-2">Ready to Duel?</h3>
                    <p className="text-muted-foreground mb-6">
                      We'll match you with an opponent of similar skill level
                    </p>
                  </div>
                  
                  <Button 
                    onClick={joinQueue}
                    className="w-full btn-mystic"
                    size="lg"
                  >
                    <Swords className="mr-2 h-5 w-5" />
                    Find Match
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center py-8">
                    <Loader2 className="h-16 w-16 mx-auto mb-4 text-primary animate-spin" />
                    <h3 className="text-xl font-semibold mb-2">Searching for Opponent...</h3>
                    <p className="text-muted-foreground">
                      {estimatedWait && `Estimated wait: ${estimatedWait}s`}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-primary animate-pulse" style={{ width: "60%" }} />
                    </div>
                    <p className="text-xs text-center text-muted-foreground">
                      Finding the perfect match...
                    </p>
                  </div>

                  <Button 
                    onClick={cancelSearch}
                    variant="outline"
                    className="w-full"
                  >
                    Cancel Search
                  </Button>
                </div>
              )}
            </div>
          </Card>

          <Card className="card-mystic p-6">
            <h3 className="font-semibold mb-4">How Matchmaking Works</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>We match players with similar ELO ratings (±200 points)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Average wait time is 30-60 seconds</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Win or lose, your ELO will be updated after the match</span>
              </li>
            </ul>
          </Card>
        </div>
      </main>
    </div>
  );
}
