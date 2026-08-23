import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Users, Clock, CheckCircle, XCircle, ChevronRight, MessageSquare, Handshake, RefreshCw } from "lucide-react";
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
  winner_id: string | null;
  player1_result: string | null;
  player2_result: string | null;
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
  const [recalculating, setRecalculating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenFromRound, setRegenFromRound] = useState<number | null>(null);

  const handleRecalcPoints = async () => {
    setRecalculating(true);
    try {
      const { data, error } = await (supabase as any).rpc('recalc_tournament_stats', {
        p_tournament_id: tournamentId,
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.message);
      toast({ title: "Pontos recalculados!", description: "A classificação foi atualizada." });
      fetchMatchesWithReports();
    } catch (error: any) {
      toast({ title: "Erro ao recalcular", description: error.message, variant: "destructive" });
    } finally {
      setRecalculating(false);
    }
  };

  const handleRegenerateBracket = async (fromRound: number) => {
    if (!confirm(`Regerar a chave a partir da rodada ${fromRound}? Todas as rodadas posteriores serão apagadas e recriadas com os resultados atuais.`)) return;
    setRegenerating(true);
    try {
      const { data, error } = await (supabase as any).rpc('regenerate_tournament_bracket', {
        p_tournament_id: tournamentId,
        p_from_round: fromRound,
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.message);
      const gen = data?.generation;
      toast({
        title: "Chave regerada!",
        description: gen && gen.success === false
          ? `Rodadas posteriores removidas e pontos recalculados. ${gen.message}`
          : `Nova rodada criada com ${gen?.matches_created ?? 0} partida(s).`,
      });
      fetchMatchesWithReports();
      onGenerateNewBracket();
    } catch (error: any) {
      toast({ title: "Erro ao regerar chave", description: error.message, variant: "destructive" });
    } finally {
      setRegenerating(false);
    }
  };



  useEffect(() => {
    fetchMatchesWithReports();
  }, [tournamentId]);

  const fetchMatchesWithReports = async () => {
    try {
      // Fetch matches
      const { data: matchesData, error: matchesError } = await (supabase as any)
        .from('tournament_matches')
        .select(`
          id, round, player1_id, player2_id, status, match_deadline,
          player1_reported, player2_reported, winner_id, player1_result, player2_result
        `)

        .eq('tournament_id', tournamentId)
        .order('round', { ascending: true })
        .order('created_at', { ascending: true });

      if (matchesError) throw matchesError;

      // Fetch reports for each match
      const matchIds = matchesData?.map(m => m.id) || [];
      const reportsByMatch: Record<string, any[]> = {};

      if (matchIds.length > 0) {
        const { data: reportsData } = await (supabase as any)
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

  const availableRounds = Array.from(new Set(matches.map((m) => m.round))).sort((a, b) => a - b);


  const canGenerateNewBracket = () => {
    // Can generate new bracket if all pending/in_progress matches have both reports
    const pendingMatches = matches.filter(m => 
      ['pending', 'in_progress'].includes(m.status)
    );
    
    if (pendingMatches.length === 0) return true;
    
    return pendingMatches.every(m => m.player1_reported && m.player2_reported);
  };

  const handleSetResult = async (matchId: string, result: 'player1_win' | 'player2_win' | 'draw') => {
    try {
      const { data, error } = await (supabase as any)
        .rpc('set_match_result', {
          p_match_id: matchId,
          p_result: result,
        });

      if (error) throw error;
      if (data && data.success === false) throw new Error(data.message);

      toast({
        title: result === 'draw' ? "Empate registrado!" : "Resultado atualizado!",
        description: "Os pontos do torneio foram recalculados automaticamente.",
      });

      onMatchResolved(matchId);
      fetchMatchesWithReports();
    } catch (error: any) {
      toast({
        title: "Erro ao definir resultado",
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">
                Gerencie as partidas, edite resultados e regere o chaveamento
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={handleRecalcPoints}
                disabled={recalculating}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${recalculating ? 'animate-spin' : ''}`} />
                Recalcular Pontos
              </Button>
              <Button
                className="btn-mystic text-white"
                disabled={!canGenerateNewBracket()}
                onClick={onGenerateNewBracket}
              >
                <ChevronRight className="w-4 h-4 mr-2 rotate-180" />
                Gerar Nova Chave
              </Button>
            </div>
          </div>

          {availableRounds.length > 0 && (
            <div className="mt-4 border-t pt-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                Alterou um resultado antigo? Regere a chave a partir da rodada corrigida — as rodadas
                seguintes são apagadas, os pontos recalculados e um novo chaveamento é criado.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={regenFromRound ?? availableRounds[availableRounds.length - 1]}
                  onChange={(e) => setRegenFromRound(Number(e.target.value))}
                >
                  {availableRounds.map((r) => (
                    <option key={r} value={r}>Rodada {r}</option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  className="border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
                  disabled={regenerating}
                  onClick={() =>
                    handleRegenerateBracket(regenFromRound ?? availableRounds[availableRounds.length - 1])
                  }
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${regenerating ? 'animate-spin' : ''}`} />
                  Regerar chave a partir desta rodada
                </Button>
              </div>
            </div>
          )}

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
                  match.status === 'completed' ? 'opacity-80' : ''
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

                  {/* Resultado atual */}
                  {match.status === 'completed' && (
                    <div className="text-center text-sm">
                      <span className="text-muted-foreground">Resultado atual: </span>
                      <span className="font-medium">
                        {match.player1_result === 'draw' || match.player2_result === 'draw'
                          ? 'Empate'
                          : match.winner_id === match.player1_id
                            ? `${match.player1_username} venceu`
                            : match.winner_id === match.player2_id
                              ? `${match.player2_username} venceu`
                              : 'Não definido'}
                      </span>
                    </div>
                  )}

                  {/* Actions for Creator - edição permitida a qualquer momento */}
                  {bothPlayersReady && (
                    <div className="space-y-2">
                      <p className="text-xs text-yellow-500 text-center">
                        {match.status === 'completed'
                          ? '✏️ Você pode editar o resultado a qualquer momento — os pontos são recalculados.'
                          : !allReported
                            ? '⚠️ Reporte manual: você pode definir o resultado mesmo sem o reporte dos jogadores.'
                            : ''}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          className="flex-1 min-w-[140px] border-green-500/50 text-green-500 hover:bg-green-500/10"
                          onClick={() => handleSetResult(match.id, 'player1_win')}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          {match.player1_username} Venceu
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 min-w-[140px] border-green-500/50 text-green-500 hover:bg-green-500/10"
                          onClick={() => handleSetResult(match.id, 'player2_win')}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          {match.player2_username} Venceu
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 min-w-[140px] border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
                          onClick={() => handleSetResult(match.id, 'draw')}
                        >
                          <Handshake className="w-4 h-4 mr-2" />
                          Empate
                        </Button>
                      </div>
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
