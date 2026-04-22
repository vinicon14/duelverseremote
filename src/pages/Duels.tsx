/**
 * DuelVerse - Lista de Duelos
 * Desenvolvido por Vinícius
 * 
 * Exibe salas de duelo disponíveis e permite criar novas salas.
 * Inclui chat global e popup de anúncio.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Swords, Plus, Users, Clock, Download, Search, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import { useBanCheck } from "@/hooks/useBanCheck";
import { AdPopup } from "@/components/AdPopup";
import { GlobalChat } from "@/components/GlobalChat";
import { cleanupAllEmptyDuels } from "@/hooks/useDuelPresence";
import { useTcg } from "@/contexts/TcgContext";
import { detectPlatform } from "@/utils/platformDetection";
import { useTranslation } from "react-i18next";

const Duels = () => {
  useBanCheck();
  const { t } = useTranslation();
  const { activeTcg } = useTcg();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [duels, setDuels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [roomName, setRoomName] = useState("");
  const [isRanked, setIsRanked] = useState(true);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(50);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAdPopup, setShowAdPopup] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingAction, setPendingAction] = useState<{ type: 'create' | 'join', duelId?: string } | null>(null);

  const platform = detectPlatform();
  const isWebBrowser = !platform.isStandalone && !(window as any).electronAPI?.isElectron && !platform.isNativeApp;

  useEffect(() => {
    checkAuth();
    fetchDuels();
    


    const cleanupEmptyRooms = async () => {
      try {
        await cleanupAllEmptyDuels();
      } catch (error) {
        console.error('Erro ao executar limpeza:', error);
      }
    };
    
    cleanupEmptyRooms();

    const channel = supabase
      .channel('live_duels_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_duels'
        },
        () => {
          fetchDuels();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTcg]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
    }
  };

  const fetchDuels = async () => {
    try {
      const { data, error } = await supabase
        .from('live_duels')
        .select(`
          *,
          creator:profiles!live_duels_creator_id_fkey(username, avatar_url),
          opponent:profiles!live_duels_opponent_id_fkey(username, avatar_url)
        `)
        .eq('tcg_type', activeTcg)
        .in('status', ['waiting', 'in_progress'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDuels(data || []);
    } catch (error: any) {
      toast({
        title: t('duels.errorLoad'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDuel = () => {
    if (!roomName.trim()) {
      toast({
        title: t('duels.nameRequired'),
        description: t('duels.nameRequiredDesc'),
        variant: "destructive",
      });
      return;
    }
    
    // Mostrar anúncio antes de criar
    setPendingAction({ type: 'create' });
    setShowCreateDialog(false);
    setShowAdPopup(true);
  };

  const createDuel = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Verificar se o usuário já está em algum duelo ativo
      const { data: existingDuels } = await supabase
        .from('live_duels')
        .select('id, status')
        .or(`creator_id.eq.${user.id},opponent_id.eq.${user.id}`)
        .in('status', ['waiting', 'in_progress']);

      if (existingDuels && existingDuels.length > 0) {
        toast({
          title: t('duels.alreadyInDuel'),
          description: t('duels.alreadyInDuelDesc'),
          variant: "destructive",
        });
        navigate(`/duel/${existingDuels[0].id}`);
        return;
      }

      const defaultLP = activeTcg === 'magic' ? 40 : activeTcg === 'pokemon' ? 6 : 8000;
      const playerCount = activeTcg === 'magic' ? maxPlayers : 2;
      const { data, error } = await supabase
        .from('live_duels')
        .insert({
          creator_id: user.id,
          room_name: roomName,
          is_ranked: isRanked,
          duration_minutes: durationMinutes,
          tcg_type: activeTcg,
          player1_lp: defaultLP,
          player2_lp: defaultLP,
          player3_lp: defaultLP,
          player4_lp: defaultLP,
          max_players: playerCount,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: t('duels.roomCreated'),
        description: t('duels.roomCreatedDesc'),
      });

      // Redirecionar diretamente para a sala
      navigate(`/duel/${data.id}`);
    } catch (error: any) {
      toast({
        title: t('duels.errorCreate'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleJoinDuel = (duelId: string) => {
    // Mostrar anúncio antes de entrar
    setPendingAction({ type: 'join', duelId });
    setShowAdPopup(true);
  };

  const handleAdClose = () => {
    setShowAdPopup(false);
    
    // Executar ação pendente após fechar o anúncio
    if (pendingAction) {
      if (pendingAction.type === 'create') {
        createDuel();
      } else if (pendingAction.type === 'join' && pendingAction.duelId) {
        joinDuel(pendingAction.duelId);
      }
      setPendingAction(null);
    }
  };

  const joinDuel = async (duelId: string) => {
    try {
      console.log('[Duels] Tentando entrar no duelo:', duelId);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[Duels] Usuário não autenticado');
        return;
      }

      // Verificar se o duelo existe e pegar seus dados
      const { data: duelData } = await supabase
        .from('live_duels')
        .select('*')
        .eq('id', duelId)
        .maybeSingle();

      if (!duelData) {
        toast({
          title: t('duels.duelNotFound'),
          description: t('duels.duelNotFoundDesc'),
          variant: "destructive",
        });
        return;
      }

      console.log('[Duels] Dados do duelo:', duelData);
      const d = duelData as any;

      // Verificar se o usuário já é um dos jogadores deste duelo
      if (d.creator_id === user.id || d.opponent_id === user.id || d.player3_id === user.id || d.player4_id === user.id) {
        console.log('[Duels] Usuário já participa deste duelo, redirecionando...');
        toast({
          title: t('duels.alreadyInThisDuel'),
          description: t('duels.redirecting'),
        });
        navigate(`/duel/${duelId}`);
        return;
      }

      // Verificar se o usuário já está em outro duelo ativo
      const { data: otherDuels } = await supabase
        .from('live_duels')
        .select('id')
        .or(`creator_id.eq.${user.id},opponent_id.eq.${user.id}`)
        .in('status', ['waiting', 'in_progress'])
        .neq('id', duelId);

      if (otherDuels && otherDuels.length > 0) {
        console.log('[Duels] Usuário já está em outro duelo');
        toast({
          title: t('duels.alreadyInOtherDuel'),
          description: t('duels.alreadyInOtherDuelDesc'),
          variant: "destructive",
        });
        navigate(`/duel/${otherDuels[0].id}`);
        return;
      }

      // Determine which slot to fill
      const maxPlayers = d.max_players || 2;
      let updatePayload: any = {};

      if (!d.opponent_id) {
        updatePayload.opponent_id = user.id;
        if (maxPlayers === 2) {
          updatePayload.started_at = new Date().toISOString();
        }
      } else if (maxPlayers >= 3 && !d.player3_id) {
        updatePayload.player3_id = user.id;
      } else if (maxPlayers >= 4 && !d.player4_id) {
        updatePayload.player4_id = user.id;
        updatePayload.started_at = new Date().toISOString();
      } else {
        toast({
          title: t('duels.roomFull'),
          description: t('duels.roomFullDesc'),
          variant: "destructive",
        });
        return;
      }

      console.log('[Duels] Atualizando duelo com slot:', updatePayload);

      const { error, data: updateResult } = await supabase
        .from('live_duels')
        .update(updatePayload)
        .eq('id', duelId)
        .select();

      if (error) {
        console.error('[Duels] Erro ao entrar no duelo:', error);
        throw error;
      }

      console.log('[Duels] Update result:', updateResult);

      toast({
        title: t('duels.joiningMatch'),
        description: t('duels.joiningMatchDesc'),
      });

      await new Promise(resolve => setTimeout(resolve, 800));
      
      navigate(`/duel/${duelId}`);
    } catch (error: any) {
      console.error('[Duels] Erro em joinDuel:', error);
      toast({
        title: t('duels.errorJoin'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-transparent">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8 animate-fade-in-up">
              <div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gradient-mystic mb-2 flex items-center gap-1">
                  <span className="relative inline-flex items-center mr-2">
                    <Swords className="w-8 h-8 animate-sword-left text-primary" />
                    <Swords className="w-8 h-8 -ml-4 animate-sword-right text-accent" />
                    <span className="absolute inset-0 flex items-center justify-center animate-clash-spark">
                      <Sparkles className="w-4 h-4 text-secondary" />
                    </span>
                  </span>
                  {t('duels.title')}
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground">
                  {t('duels.subtitle')}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {isWebBrowser && (
                  <Link to="/install-app">
                    <Button variant="outline" className="w-full sm:w-auto">
                      <Download className="mr-2 h-4 w-4" />
                      {t('duels.download')}
                    </Button>
                  </Link>
                )}
                <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button className="btn-mystic text-white w-full sm:w-auto">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('duels.createDuel')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="card-mystic !fixed max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-gradient-mystic">{t('duels.createRoom')}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="room-name">{t('duels.roomName')}</Label>
                      <Input
                        id="room-name"
                        placeholder={t('duels.roomNamePlaceholder')}
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        className="bg-background/50"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>{t('duels.matchType')}</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant={isRanked ? "default" : "outline"}
                          onClick={() => setIsRanked(true)}
                          className={isRanked ? "btn-mystic text-white" : ""}
                        >
                          {t('duels.rankedBtn')}
                        </Button>
                        <Button
                          type="button"
                          variant={!isRanked ? "default" : "outline"}
                          onClick={() => setIsRanked(false)}
                          className={!isRanked ? "btn-mystic text-white" : ""}
                        >
                          {t('duels.casualBtn')}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {isRanked 
                          ? t('duels.rankedHint')
                          : t('duels.casualHint')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="duration">{t('duels.duration')}</Label>
                      <div className="grid grid-cols-4 gap-2">
                        {[30, 50, 90, 120].map((mins) => (
                          <Button
                            key={mins}
                            type="button"
                            variant={durationMinutes === mins ? "default" : "outline"}
                            onClick={() => setDurationMinutes(mins)}
                            className={durationMinutes === mins ? "btn-mystic text-white" : ""}
                          >
                            {mins}m
                          </Button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('duels.durationHint', { minutes: durationMinutes })}
                      </p>
                    </div>
                    
                    {activeTcg === 'magic' && (
                      <div className="space-y-2">
                        <Label>{t('duels.playerCount')}</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant={maxPlayers === 2 ? "default" : "outline"}
                            onClick={() => setMaxPlayers(2)}
                            className={maxPlayers === 2 ? "btn-mystic text-white" : ""}
                          >
                            {t('duels.twoPlayers')}
                          </Button>
                          <Button
                            type="button"
                            variant={maxPlayers === 4 ? "default" : "outline"}
                            onClick={() => setMaxPlayers(4)}
                            className={maxPlayers === 4 ? "btn-mystic text-white" : ""}
                          >
                            {t('duels.fourPlayers')}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {maxPlayers === 4 
                            ? t('duels.fourPlayersHint')
                            : t('duels.twoPlayersHint')}
                        </p>
                      </div>
                    )}

                    <Button onClick={handleCreateDuel} className="w-full btn-mystic text-white">
                      {t('duels.createAndEnter')}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              </div>
            </div>

            {!loading && duels.length > 10 && (
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('duels.searchRoom')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-background/50"
                />
              </div>
            )}

            {(() => {
              const filteredDuels = searchQuery.trim()
                ? duels.filter(d => (d.room_name || '').toLowerCase().includes(searchQuery.trim().toLowerCase()))
                : duels;

              if (loading) return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="card-mystic animate-pulse">
                      <CardHeader className="h-32" />
                    </Card>
                  ))}
                </div>
              );

              if (filteredDuels.length === 0) return (
                <Card className="card-mystic text-center py-12">
                  <Swords className="w-16 h-16 mx-auto text-primary/50 mb-4" />
                  <h3 className="text-xl font-semibold mb-2">
                    {searchQuery.trim() ? t('duels.noRoomFound') : t('duels.noDuels')}
                  </h3>
                  <p className="text-muted-foreground">
                    {searchQuery.trim() ? t('duels.noMatch', { query: searchQuery }) : t('duels.beFirst')}
                  </p>
                </Card>
              );

              return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredDuels.map((duel, index) => (
                  <Card key={duel.id} className="card-mystic hover:border-primary/40 transition-all animate-fade-in-up" style={{ animationDelay: `${index * 0.07}s` }}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-gradient-mystic">{duel.room_name}</span>
                        <div className="flex gap-1">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            duel.is_ranked 
                              ? 'bg-yellow-500/20 text-yellow-500' 
                              : 'bg-blue-500/20 text-blue-500'
                          }`}>
                            {duel.is_ranked ? '🏆 Ranqueada' : '🎮 Casual'}
                          </span>
                          {duel.status === 'waiting' ? (
                            <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary">
                              Aguardando
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded-full bg-accent/20 text-accent">
                              Em andamento
                            </span>
                          )}
                        </div>
                      </CardTitle>
                      <CardDescription>
                        Criado por {duel.creator?.username || 'Anônimo'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center text-muted-foreground">
                            <Users className="w-4 h-4 mr-2" />
                            {(() => {
                              const mp = (duel as any).max_players || 2;
                              let count = 1;
                              if (duel.opponent_id) count++;
                              if ((duel as any).player3_id) count++;
                              if ((duel as any).player4_id) count++;
                              return t('duels.playersCount', { count, max: mp });
                            })()}
                          </div>
                          <div className="flex items-center text-muted-foreground">
                            <Clock className="w-4 h-4 mr-2" />
                            {new Date(duel.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>

                        {duel.status === 'waiting' && (() => {
                          const mp = (duel as any).max_players || 2;
                          let count = 1;
                          if (duel.opponent_id) count++;
                          if ((duel as any).player3_id) count++;
                          if ((duel as any).player4_id) count++;
                          return count < mp;
                        })() && (
                          <Button
                            onClick={() => handleJoinDuel(duel.id)}
                            className="w-full btn-mystic text-white"
                          >
                            <Swords className="mr-2 h-4 w-4" />
                            {t('duels.enterDuel')}
                          </Button>
                        )}

                        {duel.status === 'in_progress' && (() => {
                          const mp = (duel as any).max_players || 2;
                          let count = 1;
                          if (duel.opponent_id) count++;
                          if ((duel as any).player3_id) count++;
                          if ((duel as any).player4_id) count++;
                          return count < mp;
                        })() && (
                          <Button
                            onClick={() => handleJoinDuel(duel.id)}
                            className="w-full btn-mystic text-white"
                          >
                            <Users className="mr-2 h-4 w-4" />
                            {t('duels.enterRoom')}
                          </Button>
                        )}

                        {duel.status === 'in_progress' && (() => {
                          const mp = (duel as any).max_players || 2;
                          let count = 1;
                          if (duel.opponent_id) count++;
                          if ((duel as any).player3_id) count++;
                          if ((duel as any).player4_id) count++;
                          return count >= mp;
                        })() && (
                          <Button
                            onClick={() => navigate(`/duel/${duel.id}`)}
                            className="w-full btn-mystic text-white"
                          >
                            <Users className="mr-2 h-4 w-4" />
                            {t('duels.watchDuel')}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              );
            })()}
          </div>

          {/* Chat Global */}
          <div className="h-[600px]">
            <GlobalChat />
          </div>
        </div>
      </main>

      {/* Popup de anúncio */}
      {showAdPopup && (
        <AdPopup onClose={handleAdClose} />
      )}
    </div>
  );
};

export default Duels;

