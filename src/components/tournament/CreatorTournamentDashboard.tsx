import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Users, Clock, CheckCircle, XCircle, ChevronRight, MessageSquare } from "lucide-react";
import { TournamentChat } from "@/components/TournamentChat";

interface CreatorTournamentDashboardProps {
  tournamentId: string;
  onGenerateNewBracket: () => void;
  onMatchResolved: (matchId: string) => void;
}

interface MatchWithReports {
  id: string;
  round: number;
  player1_id: string | null;
  player2_id: string | null;
  player1_username: string | null;
  player2_username: string | null;
  player1_reported: boolean;
  player2_reported: boolean;
  status: string;
  match_deadline: string | null;
  reports: {
    reporter_id: string;
    reporter_username: string;
    reported_result: string;
    is_creator: boolean;
  }[];
}

export const CreatorTournamentDashboard = ({
  tournamentId,
  onGenerateNewBracket,
  onMatchResolved,
}: CreatorTournamentDashboardProps) => {
  const { toast } = useToast();
  const [matches, setMatches] = useState<MatchWithReports[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<MatchWithReports | null>(null);

  useEffect(() => {
    fetchMatchesWithReports();
  }, [tournamentId]);

  const fetchMatchesWithReports = async () => {
    try {
      // Fetch matches
      const { data: matchesData, error: matchesError } = await supabase
        .from('tournament_matches')
        .select(`
          id, round, player1_id, player2_id, status, match_deadline,
          player1_reported, player2_reported
        `)
        .eq('tournament_id', tournamentId)
        .order('round', { ascending: true })
        .order('created_at', { ascending: true });

      if (matchesError) throw matchesError;

      // Fetch reports for each match
      const matchIds = matchesData?.map(m => m.id) || [];
      let reportsByMatch: Record<string, any[]> = {};

      if (matchIds.length > 0) {
        const { data: reportsData } = await supabase
          .from('tournament_match_reports')
          .select(`
            match_id, reporter_id, reported_result, is_creator, created_at
          `)
          .in('match_id', matchIds);

        // Group reports by match
        reportsData?.forEach(report => {
          if (!reportsByMatch[report.match_id]) {
            reportsByMatch[report.match_id] = [];
          }
          reportsByMatch[report.match_id].push(report);
        });
      }

      // Get player usernames
      const allPlayerIds = new Set<string>();
      matchesData?.forEach(m => {
        if (m.player1_id) allPlayerIds.add(m.player1_id);
        if (m.player2_id) allPlayerIds.add(m.player2_id);
      });

      const playerProfiles: Record<string, string> = {};
      if (allPlayerIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username')
          .in('user_id', Array.from(allPlayerIds));

        profiles?.forEach(p => {
          playerProfiles[p.user_id] = p.username;
        });
      }

      // Build matches with reports
      const matchesWithReports: MatchWithReports[] = await Promise.all(
        (matchesData || []).map(async (match) => {
          const reports = reportsByMatch[match.id] || [];
          
          // Get reporter usernames
          const reportsWithNames = await Promise.all(
            reports.map(async (report) => {
              const { data: profile } = await supabase
                .from('profiles')
                .select('username')
                .eq('user_id', report.reporter_id)
                .maybeSingle();
              return {
                ...report,
                reporter_username: profile?.username || 'Desconhecido',
              };
            })
          );

          return {
            ...match,
            player1_username: playerProfiles[match.player1_id || ''] || 'TBD',
            player2_username: playerProfiles[match.player2_id || ''] || 'TBD',
            reports: reportsWithNames,
          };
        })
      );

      setMatches(matchesWithReports);
    } catch (error) {
      console.error('Error fetching matches:', error);
      toast({
        title: "Erro ao carregar partidas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const canGenerateNewBracket = () => {
    // Can generate new bracket if all pending/in_progress matches have both reports
    const pendingMatches = matches.filter(m => 
      ['pending', 'in_progress'].includes(m.status)
    );
    
    if (pendingMatches.length === 0) return true;
    
    return pendingMatches.every(m => m.player1_reported && m.player2_reported);
  };

  const handleSetWinner = async (matchId: string, winnerId: string) => {
    try {
      // Call Supabase function to set winner
      const { error } = await supabase
        .rpc('set_match_winner', {
          p_match_id: matchId,
          p_winner_id: winnerId
        });

      if (error) throw error;

      toast({
        title: "Vencedor definido!",
        description: "Os pontos foram distribuídos automaticamente.",
      });

      onMatchResolved(matchId);
      fetchMatchesWithReports();
    } catch (error: any) {
      toast({
        title: "Erro ao definir vencedor",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getReportSummary = (match: MatchWithReports) => {
    const p1Report = match.reports.find(r => r.reporter_id === match.player1_id);
    const p2Report = match.reports.find(r => r.reporter_id === match.player2_id);

    if (!p1Report && !p2Report) {
      return { text: "Nenhum reporte", color: "text-muted-foreground" };
    }

    if (p1Report?.reported_result === p2Report?.reported_result) {
      if (p1Report.reported_result === 'double_loss') {
        return { text: "Ambos reportaram double loss", color: "text-yellow-500" };
      }
      if (p1Report.reported_result === 'player1_win' || p1Report.reported_result === 'player2_win') {
        return { text: "Reporte coerente!", color: "text-green-500" };
      }
    }

    return { text: "Reporte incoerente", color: "text-red-500" };
  };

  if (loading) {
    return (
      <Card className="card-mystic">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-muted rounded w-1/3" />
            <div className="h-24 bg-muted rounded" />
            <div className="h-24 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="card-mystic border-yellow-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Painel do Criador
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Gerencie as partidas e distribua pontos
              </p>
            </div>
            <Button
              className="btn-mystic text-white"
              disabled={!canGenerateNewBracket()}
              onClick={onGenerateNewBracket}
            >
              <ChevronRight className="w-4 h-4 mr-2 rotate-180" />
              Gerar Nova Chave
            </Button>
          </div>
          {!canGenerateNewBracket() && (
            <p className="text-xs text-yellow-500 mt-2">
              ⚠️ Aguardando todos os reportes para gerar nova chave
            </p>
          )}
        </CardContent>
      </Card>

      {/* Current Bracket Matches */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Partidas Atuais</h3>
        
        {matches.length === 0 ? (
          <Card className="card-mystic text-center py-8">
            <Trophy className="w-12 h-12 mx-auto text-primary/50 mb-4" />
            <p className="text-muted-foreground">Nenhuma partida gerada ainda</p>
          </Card>
        ) : (
          matches.map((match) => {
            const reportSummary = getReportSummary(match);
            const allReported = match.player1_reported && match.player2_reported;
            const bothPlayersReady = match.player1_id && match.player2_id;

            return (
              <Card 
                key={match.id} 
                className={`card-mystic ${
                  match.status === 'completed' ? 'opacity-50' : ''
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Rodada {match.round}</Badge>
                      {match.status === 'completed' && (
                        <Badge variant="secondary">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Concluída
                        </Badge>
                      )}
                    </div>
                    {match.match_deadline && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        Prazo: {new Date(match.match_deadline).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Players */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 text-center">
                      <p className="font-medium">{match.player1_username}</p>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        {match.player1_reported ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <Clock className="w-4 h-4 text-yellow-500" />
                        )}
                        <span className="text-xs text-muted-foreground">
                          {match.player1_reported ? 'Reportou' : 'Aguardando'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="text-muted-foreground font-bold">VS</div>
                    
                    <div className="flex-1 text-center">
                      <p className="font-medium">{match.player2_username}</p>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        {match.player2_reported ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <Clock className="w-4 h-4 text-yellow-500" />
                        )}
                        <span className="text-xs text-muted-foreground">
                          {match.player2_reported ? 'Reportou' : 'Aguardando'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Report Summary */}
                  {bothPlayersReady && (
                    <div className={`text-center text-sm ${reportSummary.color}`}>
                      {reportSummary.text}
                    </div>
                  )}

                  {/* Actions for Creator */}
                  {bothPlayersReady && match.status !== 'completed' && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 border-green-500/50 text-green-500 hover:bg-green-500/10"
                        onClick={() => handleSetWinner(match.id, match.player1_id!)}
                        disabled={!allReported}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {match.player1_username} Venceu
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 border-green-500/50 text-green-500 hover:bg-green-500/10"
                        onClick={() => handleSetWinner(match.id, match.player2_id!)}
                        disabled={!allReported}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {match.player2_username} Venceu
                      </Button>
                    </div>
                  )}

                  {/* Reports Table */}
                  {match.reports.length > 0 && (
                    <div className="border-t pt-4 mt-4">
                      <p className="text-xs font-medium mb-2">Reportes:</p>
                      <div className="space-y-2">
                        {match.reports.map((report) => (
                          <div 
                            key={report.reporter_id} 
                            className="flex items-center justify-between text-sm"
                          >
                            <span>{report.reporter_username}</span>
                            <Badge variant={
                              report.reported_result === 'double_loss' 
                                ? 'destructive' 
                                : 'default'
                            }>
                              {report.reported_result === 'double_loss' 
                                ? 'Double Loss' 
                                : 'Vitória'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Tournament Chat */}
      <Card className="card-mystic">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Chat do Torneio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TournamentChat tournamentId={tournamentId} />
        </CardContent>
      </Card>
    </div>
  );
};
