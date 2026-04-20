/**
 * DuelVerse - Detalhes do Torneio
 * Desenvolvido por Vinícius
 * 
 * Exibe informações completas de um torneo, 
 * participantes, rodadas e permite gerenciar resultados.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Trophy, Users, Calendar, Coins, ArrowLeft, Swords, AlertTriangle, CheckCircle, Clock, FileWarning, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TournamentWinnerSelector } from "@/components/TournamentWinnerSelector";
import { TournamentChat } from "@/components/TournamentChat";
import { PlayerMatchReportModal } from "@/components/tournament/PlayerMatchReportModal";
import { useIsMobile } from "@/hooks/use-mobile";

const TournamentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tournament, setTournament] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const [isGeneratingBracket, setIsGeneratingBracket] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedReportMatch, setSelectedReportMatch] = useState<any>(null);

  // Helper para verificar se o torneio está pronto para finalização
  const isReadyForCompletion = () => {
    if (!tournament || !matches.length) return false;
    
    const currentRound = tournament.current_round;
    const totalRounds = tournament.total_rounds;
    
    if (currentRound !== totalRounds) return false;
    
    const finalRoundMatches = matches.filter(m => m.round === currentRound);
    if (finalRoundMatches.length === 0) return false;
    
    return finalRoundMatches.every(m => m.status === 'completed');
  };

  useEffect(() => {
    checkAuth();
    fetchTournamentData();
  }, [id]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth', { state: { returnTo: `/tournaments/${id}` } });
      return;
    }
    setCurrentUser(session.user);
  };

  const fetchTournamentData = async () => {
    try {
      const { data: tournamentData, error: tournamentError } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();

      if (tournamentError) throw tournamentError;
      setTournament(tournamentData);

      const { data: participantsData, error: participantsError } = await supabase
        .from('tournament_participants')
        .select('id, user_id, status, score, wins, losses, registered_at')
        .eq('tournament_id', id)
        .order('score', { ascending: false });

      if (participantsError) throw participantsError;

      const participantsWithProfiles = await Promise.all(
        (participantsData || []).map(async (participant) => {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('username, points')
              .eq('user_id', participant.user_id)
              .maybeSingle();
            
            return { 
              ...participant, 
              profiles: profile || { username: 'Usuário', points: 0 }
            };
          } catch (err) {
            console.error('Error loading profile for participant:', participant.user_id, err);
            return { 
              ...participant, 
              profiles: { username: 'Usuário', points: 0 } 
            };
          }
        })
      );

      setParticipants(participantsWithProfiles.filter(p => p && p.profiles));

      const { data: matchesData, error: matchesError } = await supabase
        .from('tournament_matches')
        .select('id, round, player1_id, player2_id, winner_id, status, scheduled_at, player1_reported, player2_reported, player1_result, player2_result, conflict_count')
        .eq('tournament_id', id)
        .order('round', { ascending: true });

      if (matchesError) throw matchesError;

      const matchesWithProfiles = await Promise.all(
        (matchesData || []).map(async (match) => {
          const [p1, p2] = await Promise.all([
            match.player1_id ? supabase.from('profiles').select('username, points').eq('user_id', match.player1_id).maybeSingle() : null,
            match.player2_id ? supabase.from('profiles').select('username, points').eq('user_id', match.player2_id).maybeSingle() : null
          ]);

          return {
            ...match,
            player1: p1?.data ? [p1.data] : [],
            player2: p2?.data ? [p2.data] : []
          };
        })
      );

      setMatches(matchesWithProfiles);
      
      const channel = supabase
        .channel(`tournament-${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_matches', filter: `tournament_id=eq.${id}` }, fetchTournamentData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_participants', filter: `tournament_id=eq.${id}` }, fetchTournamentData)
        .subscribe();
        
      return () => supabase.removeChannel(channel);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
        description: "Tente atualizar a página",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const startTournament = async () => {
    if (!tournament || participants.length < tournament.min_participants) {
      toast({
        title: "Participantes insuficientes",
        description: `É necessário pelo menos ${tournament.min_participants} participantes para iniciar o torneio.`,
        variant: "destructive",
      });
      return;
    }

    // Check if bracket already exists
    if (matches.length > 0) {
      toast({
        title: "Chaveamento já existe",
        description: "O torneio já foi iniciado anteriormente.",
        variant: "destructive",
      });
      return;
    }

    if (isGeneratingBracket) return;
    setIsGeneratingBracket(true);

    try {
      // Generate bracket
      await generateBracket();

      // Update tournament status
      await supabase
        .from('tournaments')
        .update({ 
          status: 'active', 
          start_date: new Date().toISOString(),
          current_round: 1
        })
        .eq('id', id);

      toast({
        title: "Torneio iniciado!",
        description: "As partidas foram geradas.",
      });

      await fetchTournamentData();
    } catch (error: any) {
      toast({
        title: "Erro ao iniciar torneio",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingBracket(false);
    }
  };

  const generateBracket = async () => {
    const playerIds = participants.map(p => p.user_id);
    const totalRounds = Math.ceil(Math.log2(playerIds.length));
    
    // Embaralhar jogadores para randomizar o chaveamento
    const shuffledPlayers = [...playerIds].sort(() => Math.random() - 0.5);
    
    // First round matches
    const matchesToCreate = [];
    for (let i = 0; i < shuffledPlayers.length; i += 2) {
      if (i + 1 < shuffledPlayers.length) {
        matchesToCreate.push({
          tournament_id: id,
          round: 1,
          player1_id: shuffledPlayers[i],
          player2_id: shuffledPlayers[i + 1],
          status: 'pending',
        });
      } else {
        // Jogador sem par avança automaticamente (bye)
        matchesToCreate.push({
          tournament_id: id,
          round: 1,
          player1_id: shuffledPlayers[i],
          player2_id: null,
          winner_id: shuffledPlayers[i],
          status: 'completed',
        });
      }
    }

    // Criar matches
    const { error } = await supabase
      .from('tournament_matches')
      .insert(matchesToCreate);

    if (error) throw error;

    // Atualizar total de rounds no torneio
    await supabase
      .from('tournaments')
      .update({ total_rounds: totalRounds })
      .eq('id', id);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'upcoming': return 'bg-blue-500/20 text-blue-400';
      case 'active': return 'bg-green-500/20 text-green-400';
      case 'completed': return 'bg-gray-500/20 text-gray-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const challengeOpponent = async (opponentId: string) => {
    if (!currentUser || !id) return;

    try {
      // Check if user already in active duel
      const { data: existingDuels } = await supabase
        .from('live_duels')
        .select('id, status')
        .or(`creator_id.eq.${currentUser.id},opponent_id.eq.${currentUser.id}`)
        .in('status', ['waiting', 'in_progress']);

      if (existingDuels && existingDuels.length > 0) {
        toast({
          title: "Você já está em um duelo",
          description: "Termine ou saia do duelo atual antes de desafiar.",
          variant: "destructive",
        });
        navigate(`/duel/${existingDuels[0].id}`);
        return;
      }

      // Check if opponent is available
      const { data: opponentDuels } = await supabase
        .from('live_duels')
        .select('id, status')
        .or(`creator_id.eq.${opponentId},opponent_id.eq.${opponentId}`)
        .in('status', ['waiting', 'in_progress']);

      if (opponentDuels && opponentDuels.length > 0) {
        toast({
          title: "Oponente ocupado",
          description: "Seu adversário já está em outro duelo.",
          variant: "destructive",
        });
        return;
      }

      // Create duel
      const { data: duelData, error: duelError } = await supabase
        .from('live_duels')
        .insert({
          creator_id: currentUser.id,
          status: 'waiting',
          is_ranked: false,
          tcg_type: tournament.tcg_type || 'yugioh',
          player1_lp: tournament.tcg_type === 'magic' ? 40 : tournament.tcg_type === 'pokemon' ? 6 : 8000,
          player2_lp: tournament.tcg_type === 'magic' ? 40 : tournament.tcg_type === 'pokemon' ? 6 : 8000,
        })
        .select()
        .single();

      if (duelError) throw duelError;

      // Create invite
      await supabase.from('duel_invites').insert({
        sender_id: currentUser.id,
        receiver_id: opponentId,
        duel_id: duelData.id,
        status: 'pending',
      });

      toast({
        title: "Desafio enviado!",
        description: "Convite enviado para seu adversário.",
      });

      navigate(`/duel/${duelData.id}`);
    } catch (error: any) {
      toast({
        title: "Erro ao criar desafio",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const creatorSetWinner = async (matchId: string, winnerId: string) => {
    if (!confirm('Confirmar este vencedor? Os pontos serão distribuídos automaticamente.')) return;
    try {
      const { error } = await (supabase as any).rpc('set_match_winner', {
        p_match_id: matchId,
        p_winner_id: winnerId,
      });
      if (error) throw error;
      toast({
        title: 'Vencedor definido!',
        description: 'Pontos distribuídos. A chave foi atualizada.',
      });
      await fetchTournamentData();
    } catch (error: any) {
      toast({
        title: 'Erro ao definir vencedor',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Verifica se a rodada atual está totalmente concluída e há próxima rodada
  const canGenerateNextRound = () => {
    if (!tournament || !matches.length) return false;
    if (tournament.status !== 'active') return false;
    const currentRound = tournament.current_round || 1;
    const totalRounds = tournament.total_rounds || 1;
    if (currentRound >= totalRounds) return false;
    const currentRoundMatches = matches.filter(m => m.round === currentRound);
    if (currentRoundMatches.length === 0) return false;
    const allCompleted = currentRoundMatches.every(m => m.status === 'completed');
    const hasNextAlready = matches.some(m => m.round === currentRound + 1);
    return allCompleted && !hasNextAlready;
  };

  const generateNextRound = async () => {
    if (!id) return;
    if (!confirm('Gerar o próximo chaveamento com os vencedores da rodada atual?')) return;
    try {
      const { data, error } = await (supabase as any).rpc('generate_next_round', {
        p_tournament_id: id,
      });
      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.message || 'Não foi possível gerar a próxima rodada');
      }
      toast({
        title: 'Próximo chaveamento gerado!',
        description: `Rodada ${data?.round ?? ''} criada com ${data?.matches_created ?? 0} partida(s).`,
      });
      await fetchTournamentData();
    } catch (error: any) {
      toast({
        title: 'Erro ao gerar próximo chaveamento',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const recalcStats = async () => {
    if (!id) return;
    if (!confirm('Recalcular vitórias, derrotas e pontos de todos os participantes a partir das partidas já concluídas?')) return;
    try {
      const { data, error } = await (supabase as any).rpc('recalc_tournament_stats', {
        p_tournament_id: id,
      });
      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.message || 'Não foi possível recalcular');
      }
      toast({
        title: 'Estatísticas recalculadas',
        description: 'Vitórias, derrotas e pontos foram atualizados.',
      });
      await fetchTournamentData();
    } catch (error: any) {
      toast({
        title: 'Erro ao recalcular',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const removeParticipant = async (participantId: string, participantName: string) => {
    if (!id || !confirm(`Tem certeza que deseja remover ${participantName} do torneio?`)) return;

    try {
      // Try RPC first
      const { data, error } = await (supabase as any).rpc("remove_tournament_participant", {
        p_tournament_id: id,
        p_participant_id: participantId,
      });

      // If RPC fails, use fallback
      if (error || !data?.success) {
        console.log("RPC failed, using fallback for remove_participant");
        
        // Fallback: Direct database operations
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado");

        // Get tournament info
        const { data: tournament, error: tournamentError } = await supabase
          .from('tournaments')
          .select('entry_fee, created_by')
          .eq('id', id)
          .single();

        if (tournamentError) throw new Error("Torneio não encontrado");
        if (tournament.created_by !== user.id) throw new Error("Apenas o criador pode remover participantes");

        // Remove participant
        const { error: deleteError } = await supabase
          .from('tournament_participants')
          .delete()
          .eq('tournament_id', id)
          .eq('user_id', participantId);

        if (deleteError) throw new Error("Erro ao remover participante: " + deleteError.message);

        // Refund entry fee if applicable
        if (tournament.entry_fee > 0) {
          await supabase
            .from('profiles')
            .update({ duelcoins_balance: (supabase as any).raw('duelcoins_balance + ' + tournament.entry_fee) })
            .eq('user_id', participantId);
        }
      }

      toast({
        title: "Participante removido!",
        description: `${participantName} foi removido do torneio.`,
      });

      await fetchTournamentData();
    } catch (error: any) {
      toast({
        title: "Erro ao remover participante",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-64 bg-muted rounded" />
          </div>
        </main>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-transparent">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <Card className="card-mystic text-center py-12">
            <Trophy className="w-16 h-16 mx-auto text-primary/50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Torneio não encontrado</h3>
            <Button onClick={() => navigate('/tournaments')} className="mt-4">
              Voltar para Torneios
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent">
      <Navbar />
      
      <main className="container mx-auto px-3 sm:px-4 pt-20 sm:pt-24 pb-24 sm:pb-12">
        <Button
          variant="ghost"
          onClick={() => navigate('/tournaments')}
          className="mb-4 sm:mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        {/* Pending Match Notification Banner */}
        {tournament.status === 'active' && currentUser && (() => {
          const pendingMatch = matches.find(m => 
            m.status === 'pending' && 
            (m.player1_id === currentUser.id || m.player2_id === currentUser.id)
          );
          if (!pendingMatch) return null;
          const isP1 = pendingMatch.player1_id === currentUser.id;
          const alreadyReported = isP1 ? pendingMatch.player1_reported : pendingMatch.player2_reported;
          const opponentName = isP1 
            ? (pendingMatch.player2?.[0]?.username || 'Oponente') 
            : (pendingMatch.player1?.[0]?.username || 'Oponente');
          return (
            <Card className="mb-4 border-primary/50 bg-primary/5">
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">Você possui uma partida de torneio ativa!</p>
                    <p className="text-xs text-muted-foreground">
                      {alreadyReported 
                        ? `Aguardando ${opponentName} reportar o resultado.`
                        : `Relate o resultado contra ${opponentName}.`}
                    </p>
                  </div>
                </div>
                {!alreadyReported && (
                  <Button
                    size="sm"
                    className="btn-mystic text-white shrink-0"
                    onClick={() => {
                      setSelectedReportMatch(pendingMatch);
                      setReportModalOpen(true);
                    }}
                  >
                    Reportar Resultado
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })()}

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
          {/* Tournament Info */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <Card className="card-mystic">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-xl sm:text-3xl mb-2 break-words">{tournament.name}</CardTitle>
                    <p className="text-sm sm:text-base text-muted-foreground break-words">{tournament.description}</p>
                  </div>
                  <Badge className={`${getStatusColor(tournament.status)} shrink-0`}>
                    {tournament.status === 'upcoming' && 'Em Breve'}
                    {tournament.status === 'active' && 'Ativo'}
                    {tournament.status === 'completed' && 'Finalizado'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4 sm:p-6 pt-0 sm:pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="flex items-center gap-2 text-sm sm:text-base">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
                    <span>{participants.length}/{tournament.max_participants} Participantes</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm sm:text-base">
                    <Coins className="w-4 h-4 sm:w-5 sm:h-5 text-secondary shrink-0" />
                    <span>{tournament.prize_pool} Coins de Prêmio</span>
                  </div>
                </div>

                {tournament.start_date && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>Início: {new Date(tournament.start_date).toLocaleString()}</span>
                  </div>
                )}

                {tournament.status === 'upcoming' &&
                  !participants.some(p => p.user_id === currentUser?.id) &&
                  participants.length < tournament.max_participants && (
                    <Button
                      onClick={async () => {
                        // Verificar se o usuário é o criador do torneio
                        if (tournament.created_by === currentUser?.id) {
                          toast({
                            title: "Informação",
                            description: "Você é o criador deste torneio e não pode se inscrever como participante",
                          });
                          return;
                        }

                        try {
                          setLoading(true);
                          
                          const { data, error } = await supabase.functions.invoke('charge-tournament-entry-fee', {
                            body: { tournament_id: id },
                          });

                          // Parse error body if available
                          let message = data?.message || '';
                          if (error && !message) {
                            try {
                              const ctx = (error as any)?.context;
                              if (ctx && typeof ctx.json === 'function') {
                                const body = await ctx.json();
                                message = body?.message || error.message;
                              } else {
                                message = error.message;
                              }
                            } catch { message = error.message; }
                          }
                          if (!message) message = 'Erro ao se inscrever';

                          if (error || !data?.success) {
                            const isAlreadyJoined = message.includes('já está inscrito') || message.includes('23505');
                            const isNoBalance = message.includes('Saldo insuficiente') || message.includes('precisa de');
                            
                            toast({
                              title: isAlreadyJoined ? "Você já está inscrito" : isNoBalance ? "Saldo insuficiente" : "Não foi possível se inscrever",
                              description: isAlreadyJoined ? "Você já está inscrito neste torneio." : isNoBalance ? "Você não tem DuelCoins suficientes para se inscrever." : message,
                              variant: "destructive",
                            });
                            if (isNoBalance) {
                              setTimeout(() => navigate('/buy-duelcoins'), 1500);
                            }
                            setLoading(false);
                            return;
                          }

                          toast({
                            title: "Sucesso!",
                            description: data.message,
                          });

                          await fetchTournamentData();
                        } catch (error: any) {
                          const msg = error?.message || '';
                          const isAlreadyJoined = msg.includes('já está inscrito') || msg.includes('23505');
                          const isNoBalance = msg.includes('Saldo insuficiente') || msg.includes('precisa de');
                          
                          toast({
                            title: isAlreadyJoined ? "Você já está inscrito" : isNoBalance ? "Saldo insuficiente" : "Não foi possível se inscrever",
                            description: isAlreadyJoined ? "Você já está inscrito neste torneio." : isNoBalance ? "Você não tem DuelCoins suficientes para se inscrever." : msg,
                            variant: "destructive",
                          });
                          if (isNoBalance) {
                            setTimeout(() => navigate('/buy-duelcoins'), 1500);
                          }
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="w-full btn-mystic text-white"
                      disabled={loading}
                    >
                      {loading ? "Processando..." : tournament.entry_fee > 0 ? `Participar (${tournament.entry_fee} DuelCoins)` : 'Participar Gratuitamente'}
                    </Button>
                  )}

                {tournament.status === 'upcoming' && tournament.created_by === currentUser?.id && (
                  <Button
                    onClick={startTournament}
                    className="w-full btn-mystic text-white"
                    disabled={participants.length < tournament.min_participants || isGeneratingBracket}
                  >
                    {isGeneratingBracket ? 'Iniciando...' : 'Iniciar Torneio'}
                  </Button>
                )}
                
                {tournament.status === 'active' && tournament.created_by === currentUser?.id && (
                  <>
                    {isReadyForCompletion() && (
                      <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                        <p className="text-sm text-yellow-600 font-medium">
                          🏆 Todas as partidas da final foram completadas!
                        </p>
                        <p className="text-xs text-yellow-600/80 mt-1">
                          Selecione o vencedor abaixo para distribuir o prêmio e finalizar o torneio.
                        </p>
                      </div>
                    )}
                    <TournamentWinnerSelector
                      tournamentId={id!}
                      participants={participants}
                      prizePool={tournament.prize_pool}
                      creatorId={tournament.created_by}
                      onWinnerSelected={() => {
                        fetchTournamentData();
                      }}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Matches Bracket - Pro tournament style */}
            {matches.length > 0 && (() => {
              const allRounds = Array.from(new Set(matches.map(m => m.round))).sort((a, b) => a - b);
              const maxRound = Math.max(...allRounds);
              const totalRounds = tournament.total_rounds || maxRound;
              
              const getRoundLabel = (round: number) => {
                if (round === totalRounds) return '🏆 Final';
                if (round === totalRounds - 1) return 'Semifinal';
                if (round === totalRounds - 2) return 'Quartas de Final';
                return `Rodada ${round}`;
              };

              return (
                <Card className="card-mystic overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10 border-b border-border/50 p-3 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <CardTitle className="flex items-center gap-2 text-base sm:text-xl flex-wrap">
                        <Trophy className="w-5 h-5 text-primary shrink-0" />
                        <span>Chaveamento</span>
                        <Badge variant="outline" className="text-[10px] sm:text-xs">
                          R{tournament.current_round || 1}/{totalRounds}
                        </Badge>
                      </CardTitle>
                      {tournament.status === 'active' && tournament.created_by === currentUser?.id && (
                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                          {canGenerateNextRound() && (
                            <Button
                              size="sm"
                              onClick={generateNextRound}
                              className="btn-mystic text-white shadow-lg w-full sm:w-auto"
                            >
                              <Trophy className="w-4 h-4 mr-2" />
                              <span className="sm:hidden">Próxima rodada</span>
                              <span className="hidden sm:inline">Gerar próxima rodada (Suíço)</span>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={recalcStats}
                            className="w-full sm:w-auto text-xs"
                            title="Recalcula vitórias/derrotas/pontos a partir das partidas concluídas"
                          >
                            Recalcular pontos
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 sm:p-6">
                    {/* Mobile: vertical accordion. Desktop: horizontal columns. */}
                    <div className="md:overflow-x-auto md:pb-4 md:-mx-2 md:px-2">
                      <div className="flex flex-col md:flex-row gap-3 md:gap-6 md:min-w-max lg:min-w-0">
                        {allRounds.map(round => {
                          const roundMatches = matches.filter(m => m.round === round);
                          const isCurrentRound = round === (tournament.current_round || 1);
                          const isPastRound = round < (tournament.current_round || 1);

                          return (
                            <details
                              key={round}
                              open={!isMobile || isCurrentRound}
                              className="group md:flex-1 md:min-w-[300px] md:!block rounded-lg border border-border/40 md:border-0 bg-background/40 md:bg-transparent"
                            >
                              <summary
                                className={`md:cursor-default cursor-pointer list-none px-3 py-3 md:px-0 md:py-0 md:mb-4 md:text-center md:pb-3 md:border-b-2 transition-colors flex items-center justify-between md:block ${
                                  isCurrentRound ? 'md:border-primary' : isPastRound ? 'md:border-muted' : 'md:border-border/30'
                                }`}
                              >
                                <div className="md:text-center">
                                  <h4 className={`font-bold text-sm sm:text-base uppercase tracking-wider ${
                                    isCurrentRound ? 'text-primary' : isPastRound ? 'text-muted-foreground' : 'text-foreground/60'
                                  }`}>
                                    {getRoundLabel(round)}
                                  </h4>
                                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 md:mt-1">
                                    {roundMatches.length} {roundMatches.length === 1 ? 'partida' : 'partidas'}
                                  </p>
                                </div>
                                <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180 md:hidden" />
                              </summary>

                              {/* Round Matches */}
                              <div className="space-y-3">
                                {roundMatches.map((match, idx) => {
                                  const p1Won = match.winner_id === match.player1_id;
                                  const p2Won = match.winner_id === match.player2_id;
                                  const isCompleted = match.status === 'completed';
                                  const isBye = isCompleted && !match.player2_id;
                                  
                                  return (
                                    <Card
                                      key={match.id}
                                      className={`relative overflow-hidden transition-all hover:shadow-lg ${
                                        isCompleted
                                          ? 'bg-gradient-to-br from-background to-primary/5 border-primary/30'
                                          : 'bg-background/80 border-border'
                                      } ${match.conflict_count > 0 ? 'ring-2 ring-destructive/40' : ''}`}
                                    >
                                      {/* Match number ribbon */}
                                      <div className="absolute top-0 left-0 bg-muted/60 text-[10px] px-2 py-0.5 rounded-br font-mono text-muted-foreground">
                                        #{idx + 1}
                                      </div>
                                      
                                      <CardContent className="p-3 pt-5">
                                        {/* Player 1 row */}
                                        <div className={`flex items-center justify-between gap-2 p-2 rounded-md transition-colors ${
                                          p1Won ? 'bg-primary/15 border-l-4 border-primary' : isCompleted && !isBye ? 'opacity-60' : 'bg-muted/30'
                                        }`}>
                                          <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                              p1Won ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                                            }`}>
                                              1
                                            </div>
                                            <span className={`text-sm truncate ${p1Won ? 'font-bold text-foreground' : 'text-foreground/80'}`}>
                                              {match.player1?.[0]?.username || 'TBD'}
                                            </span>
                                          </div>
                                          {p1Won && <Trophy className="w-4 h-4 text-primary shrink-0" />}
                                        </div>

                                        {/* VS divider */}
                                        <div className="flex items-center justify-center my-1">
                                          <div className="h-px flex-1 bg-border" />
                                          <span className="px-2 text-[10px] font-bold text-muted-foreground tracking-widest">
                                            {isBye ? 'BYE' : 'VS'}
                                          </span>
                                          <div className="h-px flex-1 bg-border" />
                                        </div>

                                        {/* Player 2 row */}
                                        <div className={`flex items-center justify-between gap-2 p-2 rounded-md transition-colors ${
                                          p2Won ? 'bg-primary/15 border-l-4 border-primary' : isCompleted && !isBye ? 'opacity-60' : isBye ? 'bg-muted/10' : 'bg-muted/30'
                                        }`}>
                                          <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                              p2Won ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                                            }`}>
                                              2
                                            </div>
                                            <span className={`text-sm truncate ${p2Won ? 'font-bold text-foreground' : 'text-foreground/80'} ${isBye ? 'italic text-muted-foreground' : ''}`}>
                                              {isBye ? 'Avanço automático' : (match.player2?.[0]?.username || 'TBD')}
                                            </span>
                                          </div>
                                          {p2Won && <Trophy className="w-4 h-4 text-primary shrink-0" />}
                                        </div>

                                        {/* Status & action area */}
                                        <div className="mt-3 pt-3 border-t border-border/40">
                                          <div className="flex flex-wrap items-center gap-1.5 justify-center">
                                            <Badge variant={match.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                                              {match.status === 'pending' && '⏳ Pendente'}
                                              {match.status === 'in_progress' && '⚔️ Em Andamento'}
                                              {match.status === 'completed' && '✓ Concluído'}
                                            </Badge>
                                            {tournament.status === 'active' && match.status === 'pending' && (
                                              <>
                                                {match.player1_id === currentUser?.id && match.player2_id && (
                                                  <Button
                                                    size="sm"
                                                    onClick={() => challengeOpponent(match.player2_id)}
                                                    className="btn-mystic text-white text-xs h-7"
                                                  >
                                                    <Swords className="w-3 h-3 mr-1" />
                                                    Desafiar
                                                  </Button>
                                                )}
                                                {match.player2_id === currentUser?.id && match.player1_id && (
                                                  <Button
                                                    size="sm"
                                                    onClick={() => challengeOpponent(match.player1_id)}
                                                    className="btn-mystic text-white text-xs h-7"
                                                  >
                                                    <Swords className="w-3 h-3 mr-1" />
                                                    Desafiar
                                                  </Button>
                                                )}
                                              </>
                                            )}
                                            {tournament.status === 'active' &&
                                              match.status === 'pending' &&
                                              match.player1_id && match.player2_id &&
                                              (match.player1_id === currentUser?.id || match.player2_id === currentUser?.id) && (
                                                (() => {
                                                  const isP1 = match.player1_id === currentUser?.id;
                                                  const alreadyReported = isP1 ? match.player1_reported : match.player2_reported;
                                                  const opponentName = isP1
                                                    ? (match.player2?.[0]?.username || 'Oponente')
                                                    : (match.player1?.[0]?.username || 'Oponente');
                                                  return alreadyReported ? (
                                                    <Badge variant="secondary" className="text-xs">
                                                      <Clock className="w-3 h-3 mr-1" />
                                                      Aguardando oponente
                                                    </Badge>
                                                  ) : (
                                                    <Button
                                                      size="sm"
                                                      variant="outline"
                                                      className="text-xs border-primary/50 h-7"
                                                      onClick={() => {
                                                        setSelectedReportMatch({ ...match, opponentName });
                                                        setReportModalOpen(true);
                                                      }}
                                                    >
                                                      <Trophy className="w-3 h-3 mr-1" />
                                                      Reportar
                                                    </Button>
                                                  );
                                                })()
                                              )}
                                            {match.status === 'pending' && match.conflict_count > 0 && (
                                              <Badge variant="destructive" className="text-xs">
                                                <AlertTriangle className="w-3 h-3 mr-1" />
                                                {match.conflict_count}x conflito
                                              </Badge>
                                            )}
                                            {(match.status as string) === 'manual_review' && (
                                              <Badge variant="destructive" className="text-xs">
                                                <FileWarning className="w-3 h-3 mr-1" />
                                                Revisão Manual
                                              </Badge>
                                            )}
                                          </div>
                                        </div>

                                        {/* Creator manual override */}
                                        {tournament.status === 'active' &&
                                          tournament.created_by === currentUser?.id &&
                                          match.status !== 'completed' &&
                                          match.player1_id && match.player2_id && (
                                            <div className="mt-3 pt-3 border-t border-border/40">
                                              <p className="text-[10px] text-yellow-500 mb-2 flex items-center gap-1 uppercase tracking-wider font-semibold">
                                                <AlertTriangle className="w-3 h-3" />
                                                Reporte manual (criador)
                                              </p>
                                              <div className="flex flex-col gap-1.5">
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="text-xs border-green-500/50 text-green-500 hover:bg-green-500/10 h-7"
                                                  onClick={() => creatorSetWinner(match.id, match.player1_id)}
                                                >
                                                  <CheckCircle className="w-3 h-3 mr-1" />
                                                  {match.player1?.[0]?.username || 'P1'} venceu
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="text-xs border-green-500/50 text-green-500 hover:bg-green-500/10 h-7"
                                                  onClick={() => creatorSetWinner(match.id, match.player2_id)}
                                                >
                                                  <CheckCircle className="w-3 h-3 mr-1" />
                                                  {match.player2?.[0]?.username || 'P2'} venceu
                                                </Button>
                                              </div>
                                            </div>
                                          )}
                                      </CardContent>
                                    </Card>
                                  );
                                })}
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}
          </div>

          {/* Sidebar */}
          <div className="space-y-4 sm:space-y-6">
            {/* Participants List */}
            <Card className="card-mystic">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                  Participantes
                </CardTitle>
              </CardHeader>
              <CardContent>
                 <div className="space-y-3">
                  {participants.map((participant, index) => (
                    <div key={participant.id}>
                      {index > 0 && <Separator className="my-3" />}
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                          <span className="text-xs font-bold">{index + 1}</span>
                        </div>
                         <div className="flex-1">
                           <p className="font-medium">{participant.profiles?.username || 'Usuário'}</p>
                           <p className="text-xs text-muted-foreground">
                             Pontos: {participant.score ?? 0} • V: {participant.wins ?? 0} D: {participant.losses ?? 0}
                           </p>
                         </div>
                        {participant.placement && (
                          <Badge variant="outline">
                            {participant.placement}º
                          </Badge>
                        )}
                        {tournament.status === 'upcoming' && tournament.created_by === currentUser?.id && participant.user_id !== currentUser?.id && (
                          <Button variant="destructive" size="sm" onClick={() => removeParticipant(participant.user_id, participant.profiles?.username || 'Usuário')}>
                            ✕
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {participants.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhum participante ainda
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Tournament Chat */}
            <div className="h-[400px] sm:h-[500px]">
              <TournamentChat tournamentId={id!} />
            </div>
          </div>
        </div>
      </main>

      {/* Player Match Report Modal */}
      {selectedReportMatch && (
        <PlayerMatchReportModal
          open={reportModalOpen}
          onOpenChange={setReportModalOpen}
          matchId={selectedReportMatch.id}
          opponentUsername={selectedReportMatch.opponentName || 
            (selectedReportMatch.player1_id === currentUser?.id 
              ? (selectedReportMatch.player2?.[0]?.username || 'Oponente')
              : (selectedReportMatch.player1?.[0]?.username || 'Oponente'))}
          conflictCount={selectedReportMatch.conflict_count || 0}
          alreadyReported={
            selectedReportMatch.player1_id === currentUser?.id 
              ? selectedReportMatch.player1_reported 
              : selectedReportMatch.player2_reported
          }
          onReportSubmitted={fetchTournamentData}
        />
      )}
    </div>
  );
};

export default TournamentDetail;

