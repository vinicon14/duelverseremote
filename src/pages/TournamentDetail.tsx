import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Trophy, Users, Calendar, Coins, ArrowLeft, Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TournamentWinnerSelector } from "@/components/TournamentWinnerSelector";
import { MatchResultSelector } from "@/components/MatchResultSelector";
import { TournamentChat } from "@/components/TournamentChat";

const TournamentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tournament, setTournament] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
    fetchTournamentData();
  }, [id]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
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
        .select('id, round, player1_id, player2_id, winner_id, status, scheduled_at')
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
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
      <div className="min-h-screen bg-background">
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
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-24 pb-12">
        <Button
          variant="ghost"
          onClick={() => navigate('/tournaments')}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Tournament Info */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="card-mystic">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-3xl mb-2">{tournament.name}</CardTitle>
                    <p className="text-muted-foreground">{tournament.description}</p>
                  </div>
                  <Badge className={getStatusColor(tournament.status)}>
                    {tournament.status === 'upcoming' && 'Em Breve'}
                    {tournament.status === 'active' && 'Ativo'}
                    {tournament.status === 'completed' && 'Finalizado'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    <span>{participants.length}/{tournament.max_participants} Participantes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Coins className="w-5 h-5 text-secondary" />
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
                            title: "Não permitido",
                            description: "Você não pode se inscrever no seu próprio torneio",
                            variant: "destructive",
                          });
                          return;
                        }

                        try {
                          setLoading(true);
                          
                          const { data, error } = await supabase.functions.invoke('charge-tournament-entry-fee', {
                            body: { tournament_id: id },
                          });

                          if (error) throw new Error(error.message);
                          if (!data.success) throw new Error(data.message);

                          toast({
                            title: "Sucesso!",
                            description: data.message,
                          });

                          await fetchTournamentData();
                        } catch (error: any) {
                          toast({
                            title: "Não foi possível se inscrever",
                            description: error.message,
                            variant: "destructive",
                          });
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
                    disabled={participants.length < tournament.min_participants}
                  >
                    Iniciar Torneio
                  </Button>
                )}
                
                {tournament.status === 'active' && tournament.created_by === currentUser?.id && (
                  <TournamentWinnerSelector
                    tournamentId={id!}
                    participants={participants}
                    prizePool={tournament.prize_pool}
                    creatorId={tournament.created_by}
                    onWinnerSelected={() => {
                      fetchTournamentData();
                    }}
                  />
                )}
              </CardContent>
            </Card>

            {/* Matches Bracket */}
            {matches.length > 0 && (
              <Card className="card-mystic">
                <CardHeader>
                  <CardTitle>Chaveamento</CardTitle>
                </CardHeader>
                <CardContent>
                  {Array.from(new Set(matches.map(m => m.round))).map(round => (
                    <div key={round} className="mb-6">
                      <h4 className="font-semibold mb-3">
                        {round === Math.max(...matches.map(m => m.round))
                          ? 'Final'
                          : `Rodada ${round}`}
                      </h4>
                      <div className="space-y-3">
                        {matches.filter(m => m.round === round).map(match => (
                          <Card key={match.id} className="bg-background/50">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex-1">
                                   <div className="flex items-center gap-2 mb-2">
                                     <span className={match.winner_id === match.player1_id ? 'font-bold text-primary' : ''}>
                                       {match.player1?.[0]?.username || 'TBD'}
                                     </span>
                                   </div>
                                   <div className="flex items-center gap-2">
                                     <span className={match.winner_id === match.player2_id ? 'font-bold text-primary' : ''}>
                                       {match.player2?.[0]?.username || 'TBD'}
                                     </span>
                                   </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={match.status === 'completed' ? 'default' : 'secondary'}>
                                    {match.status === 'pending' && 'Pendente'}
                                    {match.status === 'in_progress' && 'Em Andamento'}
                                    {match.status === 'completed' && 'Concluído'}
                                  </Badge>
                                  {tournament.status === 'active' && match.status === 'pending' && (
                                    <>
                                      {/* Botão de desafio para player1 */}
                                      {match.player1_id === currentUser?.id && match.player2_id && (
                                        <Button
                                          size="sm"
                                          onClick={() => challengeOpponent(match.player2_id)}
                                          className="btn-mystic text-white"
                                        >
                                          <Swords className="w-3 h-3 mr-1" />
                                          Desafiar
                                        </Button>
                                      )}
                                      {/* Botão de desafio para player2 */}
                                      {match.player2_id === currentUser?.id && match.player1_id && (
                                        <Button
                                          size="sm"
                                          onClick={() => challengeOpponent(match.player1_id)}
                                          className="btn-mystic text-white"
                                        >
                                          <Swords className="w-3 h-3 mr-1" />
                                          Desafiar
                                        </Button>
                                      )}
                                    </>
                                  )}
                                  {tournament.status === 'active' &&
                                    tournament.created_by === currentUser?.id &&
                                    match.status === 'pending' &&
                                    match.player1?.[0] &&
                                    match.player2?.[0] && (
                                      <MatchResultSelector
                                        matchId={match.id}
                                        player1={{ id: match.player1_id!, username: match.player1[0].username }}
                                        player2={{ id: match.player2_id!, username: match.player2[0].username }}
                                        onResultReported={fetchTournamentData}
                                      />
                                    )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Participants List */}
            <Card className="card-mystic">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
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
                             Pontos: {participant.profiles?.points || 0}
                           </p>
                         </div>
                        {participant.placement && (
                          <Badge variant="outline">
                            {participant.placement}º
                          </Badge>
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
            <div className="h-[500px]">
              <TournamentChat tournamentId={id!} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default TournamentDetail;
