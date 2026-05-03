/**
 * DuelVerse - Matchmaking
 * Desenvolvido por Vinícius
 * 
 * Sistema de busca de oponentes para duelos ranqueados ou casuais.
 * Suporta partidas de 2 ou 4 jogadores.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { Loader2, Swords, Users, Clock, Video, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useBanCheck } from "@/hooks/useBanCheck";
import { useTcg } from "@/contexts/TcgContext";
import { isLegacyMagicTcg } from "@/utils/tcgRules";
import { useTranslation } from "react-i18next";

interface MatchData {
  duelId: string;
  opponentName?: string;
}

export default function Matchmaking() {
  useBanCheck();
  const { activeTcg } = useTcg();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searching, setSearching] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [playersInQueue, setPlayersInQueue] = useState(0);
  const [isRanked, setIsRanked] = useState(true);
  const [playerCount, setPlayerCount] = useState<2 | 4>(2);
  const [matchFound, setMatchFound] = useState<MatchData | null>(null);
  
  const currentUserId = useRef<string | null>(null);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRedirecting = useRef(false);

  const cancelOpenMatchmakingInvite = useCallback(async () => {
    if (!currentUserId.current) return;
    await supabase
      .from('matchmaking_invites')
      .update({ status: 'cancelled' })
      .eq('host_user_id', currentUserId.current)
      .eq('status', 'open');
  }, []);

  const cleanup = useCallback(async () => {
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    if (currentUserId.current && !matchFound) {
      await supabase.from('matchmaking_queue').delete().eq('user_id', currentUserId.current);
      await cancelOpenMatchmakingInvite();
    }
  }, [matchFound, cancelOpenMatchmakingInvite]);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      currentUserId.current = session.user.id;
      fetchQueueStats();
    };
    init();
    return () => { cleanup(); };
  }, [cleanup, navigate]);

  useEffect(() => {
    if (!isLegacyMagicTcg(activeTcg)) {
      setPlayerCount(2);
    }
  }, [activeTcg]);

  useEffect(() => {
    if (searching && !matchFound) {
      timerInterval.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
    } else {
      if (timerInterval.current) { clearInterval(timerInterval.current); timerInterval.current = null; }
      if (!searching) setElapsedTime(0);
    }
    return () => { if (timerInterval.current) { clearInterval(timerInterval.current); timerInterval.current = null; } };
  }, [searching, matchFound]);

  const fetchQueueStats = useCallback(async () => {
    try {
      // Best-effort cleanup of stale entries (expired or already matched) before counting
      await supabase
        .from('matchmaking_queue')
        .delete()
        .lt('expires_at', new Date().toISOString());

      const { count } = await supabase
        .from('matchmaking_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'waiting')
        .eq('tcg_type', activeTcg)
        .gt('expires_at', new Date().toISOString());
      setPlayersInQueue(count || 0);
    } catch (error) {
      console.error('Error fetching queue stats:', error);
    }
  }, [activeTcg]);

  // Realtime updates so the counter reflects players joining/leaving instantly
  useEffect(() => {
    fetchQueueStats();
    const channel = supabase
      .channel('matchmaking-queue-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matchmaking_queue' }, () => {
        fetchQueueStats();
      })
      .subscribe();
    const refreshInterval = setInterval(fetchQueueStats, 15000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(refreshInterval);
    };
  }, [fetchQueueStats]);

  const getOpponentInfo = async (duelId: string) => {
    try {
      const { data: duel } = await supabase
        .from('live_duels')
        .select('creator_id, opponent_id')
        .eq('id', duelId)
        .single();
      if (duel) {
        const opponentId = duel.creator_id === currentUserId.current ? duel.opponent_id : duel.creator_id;
        if (opponentId) {
          const { data: profile } = await supabase.from('profiles').select('username').eq('user_id', opponentId).single();
          return profile?.username || t('matchmaking.opponentFound');
        }
      }
      return t('matchmaking.opponentFound');
    } catch { return t('matchmaking.opponentFound'); }
  };

  const handleMatchFound = useCallback(async (duelId: string) => {
    if (isRedirecting.current) return;
    isRedirecting.current = true;
    
    if (pollingInterval.current) { clearInterval(pollingInterval.current); pollingInterval.current = null; }
    if (timerInterval.current) { clearInterval(timerInterval.current); timerInterval.current = null; }
    
    if (currentUserId.current) {
      await supabase.from('matchmaking_queue').delete().eq('user_id', currentUserId.current);
      await supabase.from('redirects').delete().eq('user_id', currentUserId.current);
      // Apaga as mensagens de busca no Discord agora que o match foi feito
      try {
        await supabase.functions.invoke('discord-bridge', {
          body: { type: 'cleanup_matchmaking_messages' },
        });
      } catch (e) {
        console.warn('cleanup_matchmaking_messages skipped:', e);
      }
    }
    
    const opponentName = await getOpponentInfo(duelId);
    setElapsedTime(0);
    setSearching(false);
    setMatchFound({ duelId, opponentName });
    toast.success(t('matchmaking.matchFoundToast'));
  }, [t]);

  const checkForRedirect = useCallback(async () => {
    if (!currentUserId.current || isRedirecting.current) return false;
    try {
      const { data: queueEntry } = await supabase
        .from('matchmaking_queue')
        .select('duel_id, status')
        .eq('user_id', currentUserId.current)
        .maybeSingle();
      if (queueEntry?.status === 'matched' && queueEntry?.duel_id) {
        await handleMatchFound(queueEntry.duel_id);
        return true;
      }
      const { data: recentDuel } = await supabase
        .from('live_duels')
        .select('id')
        .or(`creator_id.eq.${currentUserId.current},opponent_id.eq.${currentUserId.current}`)
        .in('status', ['waiting', 'in_progress'])
        .not('opponent_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recentDuel?.id) { await handleMatchFound(recentDuel.id); return true; }
      const { data: redirect } = await supabase
        .from('redirects')
        .select('duel_id')
        .eq('user_id', currentUserId.current)
        .not('duel_id', 'is', null)
        .maybeSingle();
      if (redirect?.duel_id) { await handleMatchFound(redirect.duel_id); return true; }
      return false;
    } catch { return false; }
  }, [handleMatchFound]);

  const joinQueue = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Você precisa estar logado"); navigate("/auth"); return; }
      const userId = session.user.id;
      currentUserId.current = userId;
      isRedirecting.current = false;
      setMatchFound(null);

      await supabase.from('matchmaking_queue').delete().eq('user_id', userId);
      await supabase.from('redirects').delete().eq('user_id', userId);

      const { data: existingDuels } = await supabase
        .from("live_duels")
        .select("id")
        .or(`creator_id.eq.${userId},opponent_id.eq.${userId}`)
        .in("status", ["waiting", "in_progress"]);

      if (existingDuels && existingDuels.length > 0) {
        toast.error("Você já está em um duelo ativo");
        navigate(`/duel/${existingDuels[0].id}`);
        return;
      }

      setSearching(true);
      const matchType = isRanked ? 'ranked' : 'casual';

      // Get user language for regional matchmaking
      const { data: prof } = await supabase
        .from('profiles')
        .select('language_code')
        .eq('user_id', userId)
        .maybeSingle();
      const languageCode = prof?.language_code || localStorage.getItem('userLanguage') || 'en';

      const { data: matchResult, error: matchError } = await supabase
        .rpc('matchmake', {
          p_match_type: matchType,
          p_user_id: userId,
          p_tcg_type: activeTcg,
          p_max_players: playerCount,
          p_language_code: languageCode,
        });

      if (matchError) throw matchError;

      if (matchResult && matchResult.length > 0) {
        const result = matchResult[0] as { duel_id: string | null; status: string };
        if (result.status === 'matched' && result.duel_id) {
          await handleMatchFound(result.duel_id);
          return;
        }
      }

      try {
        await supabase.functions.invoke('discord-bridge', {
          body: {
            type: 'announce_matchmaking',
            matchType,
            tcgType: activeTcg,
            maxPlayers: playerCount,
            languageCode,
          },
        });
      } catch (discordError) {
        console.warn('Discord matchmaking announcement failed:', discordError);
      }

      fetchQueueStats();
      pollingInterval.current = setInterval(async () => {
        const found = await checkForRedirect();
        if (found && pollingInterval.current) {
          clearInterval(pollingInterval.current);
          pollingInterval.current = null;
        }
      }, 1000);

      setTimeout(async () => {
        if (searching && !isRedirecting.current && !matchFound) {
          await cancelSearch();
          toast.error(t('matchmaking.noOpponent'));
        }
      }, 120000);
    } catch (error: any) {
      console.error("Error in joinQueue:", error);
      toast.error(t('matchmaking.error') + error.message);
      setSearching(false);
    }
  };

  const cancelSearch = async () => {
    if (timerInterval.current) { clearInterval(timerInterval.current); timerInterval.current = null; }
    if (pollingInterval.current) { clearInterval(pollingInterval.current); pollingInterval.current = null; }
    if (currentUserId.current) {
      await supabase.from('matchmaking_queue').delete().eq('user_id', currentUserId.current);
      await cancelOpenMatchmakingInvite();
    }
    setSearching(false);
    setElapsedTime(0);
    setMatchFound(null);
    isRedirecting.current = false;
    toast.info(t('matchmaking.searchCanceled'));
    fetchQueueStats();
  };

  useEffect(() => {
    if (!searching || matchFound) return;
    const broadcastChannel = supabase
      .channel('match-broadcast')
      .on('broadcast', { event: 'match-found' }, ({ payload }) => {
        if (payload.duel_id) handleMatchFound(payload.duel_id);
      })
      .subscribe();
    return () => { supabase.removeChannel(broadcastChannel); };
  }, [searching, matchFound, handleMatchFound]);

  useEffect(() => {
    if (!searching || !currentUserId.current || matchFound) return;
    const channel = supabase
      .channel('matchmaking-updates')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matchmaking_queue',
        filter: `user_id=eq.${currentUserId.current}`
      }, (payload) => {
        if (payload.new && (payload.new as any).status === 'matched' && (payload.new as any).duel_id) {
          handleMatchFound((payload.new as any).duel_id);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [searching, matchFound, handleMatchFound]);

  const joinDuel = () => { if (matchFound?.duelId) navigate(`/duel/${matchFound.duelId}`); };
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  const remainingTime = Math.max(0, 120 - elapsedTime);

  const isMagic = isLegacyMagicTcg(activeTcg);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold gradient-text">
              {matchFound ? t('matchmaking.foundTitle') : t('matchmaking.matchmakingTitle')}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {matchFound ? t('matchmaking.yourOpponent') : t('matchmaking.findOpponent')}
            </p>
          </div>

          <Card className="card-mystic p-4 sm:p-8">
            <div className="space-y-6">
              {!matchFound && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <span className="text-sm text-muted-foreground">
                      {t('matchmaking.playersInQueueLabel')} <span className="font-bold text-foreground">{playersInQueue}</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Match Found */}
              {matchFound && (
                <div className="space-y-6">
                  <div className="text-center py-6 sm:py-8">
                    <div className="relative inline-block">
                      <CheckCircle2 className="h-16 w-16 sm:h-20 sm:w-20 mx-auto mb-4 text-green-500" />
                      <div className="absolute inset-0 h-16 w-16 sm:h-20 sm:w-20 mx-auto rounded-full bg-green-500/20 animate-ping" />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold mb-2 text-green-500">{t('matchmaking.opponentFound')}</h3>
                    <p className="text-lg text-foreground font-semibold mb-2">{t('matchmaking.vsOpponent', { name: matchFound.opponentName })}</p>
                    <p className="text-sm text-muted-foreground">{t('matchmaking.clickToJoin')}</p>
                  </div>
                  <Button onClick={joinDuel} className="w-full btn-mystic" size="lg">
                    <Video className="mr-2 h-5 w-5" /> {t('matchmaking.joinVideoCall')}
                  </Button>
                  <Button onClick={cancelSearch} variant="outline" className="w-full">{t('matchmaking.cancel')}</Button>
                </div>
              )}

              {/* Not Searching */}
              {!searching && !matchFound && (
                <div className="space-y-4">
                  <div className="text-center py-6 sm:py-8">
                    <Swords className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-primary animate-pulse" />
                    <h3 className="text-lg sm:text-xl font-semibold mb-2">{t('matchmaking.readyToDuel')}</h3>
                    <p className="text-sm sm:text-base text-muted-foreground mb-6">{t('matchmaking.findOpponentDesc')}</p>
                  </div>
                  
                  <div className="space-y-3 mb-4">
                    <label className="text-sm font-medium">{t('matchmaking.matchType')}</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant={isRanked ? "default" : "outline"} onClick={() => setIsRanked(true)} className={isRanked ? "btn-mystic text-white" : ""}>
                        🏆 {t('matchmaking.ranked')}
                      </Button>
                      <Button type="button" variant={!isRanked ? "default" : "outline"} onClick={() => setIsRanked(false)} className={!isRanked ? "btn-mystic text-white" : ""}>
                        🎮 {t('matchmaking.casual')}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      {isRanked ? t('matchmaking.countsRanking') : t('matchmaking.doesNotCount')}
                    </p>
                  </div>

                  {/* Player Count - only for MTG */}
                  {isMagic && (
                    <div className="space-y-3 mb-4">
                      <label className="text-sm font-medium">{t('matchmaking.playerCount')}</label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" variant={playerCount === 2 ? "default" : "outline"} onClick={() => setPlayerCount(2)} className={playerCount === 2 ? "btn-mystic text-white" : ""}>
                          <Users className="w-4 h-4 mr-1" /> {t('matchmaking.players2Btn')}
                        </Button>
                        <Button type="button" variant={playerCount === 4 ? "default" : "outline"} onClick={() => setPlayerCount(4)} className={playerCount === 4 ? "btn-mystic text-white" : ""}>
                          <Users className="w-4 h-4 mr-1" /> {t('matchmaking.players4Btn')}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground text-center">
                        {playerCount === 4 ? t('matchmaking.ffaDesc') : t('matchmaking.duel1v1Desc')}
                      </p>
                    </div>
                  )}
                  
                  <Button onClick={joinQueue} className="w-full btn-mystic" size="lg">
                    <Swords className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                    {t('matchmaking.searchMatch')} {isRanked ? t('matchmaking.ranked') : t('matchmaking.casual')} {isMagic && playerCount === 4 ? '(4P)' : ''}
                  </Button>
                </div>
              )}

              {/* Searching */}
              {searching && !matchFound && (
                <div className="space-y-4">
                  <div className="text-center py-6 sm:py-8">
                    <Loader2 className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-primary animate-spin" />
                    <h3 className="text-lg sm:text-xl font-semibold mb-2">{t('matchmaking.waitingLobby')}</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {playerCount === 4 ? t('matchmaking.waiting4P') : t('matchmaking.waitingOther')}
                    </p>
                    <div className="flex items-center justify-center gap-2 text-sm sm:text-base text-muted-foreground">
                      <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span>{t('matchmaking.waitTime', { time: formatTime(elapsedTime) })}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-primary transition-all duration-1000" style={{ width: `${(elapsedTime / 120) * 100}%` }} />
                    </div>
                    <p className="text-xs text-center text-muted-foreground">{t('matchmaking.remainingBeforeTimeout', { seconds: remainingTime })}</p>
                  </div>
                  <Button onClick={cancelSearch} variant="outline" className="w-full">{t('matchmaking.leaveLobby')}</Button>
                </div>
              )}
            </div>
          </Card>

          {!matchFound && (
            <Card className="card-mystic p-6">
              <h3 className="font-semibold mb-4">Como Funciona o Lobby</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><span className="text-primary mt-0.5">1.</span><span>Clique em "Buscar Partida" para entrar no lobby de espera</span></li>
                <li className="flex items-start gap-2"><span className="text-primary mt-0.5">2.</span><span>Aguarde até outro jogador também entrar no lobby</span></li>
                <li className="flex items-start gap-2"><span className="text-primary mt-0.5">3.</span><span>Quando o match for encontrado, clique no botão para entrar na chamada</span></li>
                <li className="flex items-start gap-2"><span className="text-primary mt-0.5">4.</span><span>O lobby expira em 2 minutos se nenhum oponente for encontrado</span></li>
              </ul>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
