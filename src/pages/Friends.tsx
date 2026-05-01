/**
 * DuelVerse - Amigos
 * Desenvolvido por Vinícius
 * 
 * Gerenciamento de lista de amigos, solicitações de amizade
 * e status online dos amigos em tempo real.
 */
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Users, UserPlus, Check, X, Search, Swords } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFriendsOnlineStatus } from "@/hooks/useFriendsOnlineStatus";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";

const Friends = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [sentRequests, setSentRequests] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [challengeTarget, setChallengeTarget] = useState<string | null>(null);

  // Extrair IDs dos amigos para o hook de status online
  const friendIds = useMemo(() => friends.map(f => f.user_id), [friends]);
  
  // Hook que usa Presence para verificar status online real
  const { isOnline } = useFriendsOnlineStatus(friendIds);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
      return;
    }
    setCurrentUser(session.user);
    await Promise.all([
      fetchFriends(session.user.id),
      fetchPendingRequests(session.user.id),
      fetchSentRequests(session.user.id),
    ]);
    setLoading(false);
  };

  const fetchFriends = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('friend_requests')
        .select(`
          *,
          requester:profiles!friend_requests_sender_id_fkey(user_id, username, avatar_url, is_online, last_seen),
          addressee:profiles!friend_requests_receiver_id_fkey(user_id, username, avatar_url, is_online, last_seen)
        `)
        .eq('status', 'accepted')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

      if (error) throw error;

      const friendsList = data?.map(req => {
        const friend = req.sender_id === userId ? req.addressee : req.requester;
        return { ...friend, friendshipId: req.id };
      }) || [];

      setFriends(friendsList);
    } catch (error: any) {
      console.error('Erro ao carregar amigos:', error);
    }
  };

  const fetchPendingRequests = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('friend_requests')
        .select(`
          *,
          requester:profiles!friend_requests_sender_id_fkey(user_id, username, avatar_url)
        `)
        .eq('receiver_id', userId)
        .eq('status', 'pending');

      if (error) throw error;
      setPendingRequests(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar pedidos:', error);
    }
  };

  const fetchSentRequests = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('friend_requests')
        .select(`
          *,
          addressee:profiles!friend_requests_receiver_id_fkey(user_id, username, avatar_url)
        `)
        .eq('sender_id', userId)
        .eq('status', 'pending');

      if (error) throw error;
      setSentRequests(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar pedidos enviados:', error);
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      // Use secure function to search users
      const { data, error } = await supabase
        .rpc('search_users', { 
          search_term: searchQuery,
          limit_count: 10 
        });

      if (error) throw error;
      
      // Filter out current user from results
      const filteredResults = (data || []).filter(
        (user: any) => user.user_id !== currentUser?.id
      );
      setSearchResults(filteredResults);
    } catch (error: any) {
      toast({
        title: t('friends.errorSearch'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const sendFriendRequest = async (addresseeId: string) => {
    try {
      const { error } = await supabase
        .from('friend_requests')
        .insert({
          sender_id: currentUser.id,
          receiver_id: addresseeId,
          status: 'pending',
        });

      if (error) throw error;

      toast({
        title: t('friends.requestSentTitle'),
        description: t('friends.requestSentDesc'),
      });

      await fetchSentRequests(currentUser.id);
      setSearchResults([]);
      setSearchQuery("");
    } catch (error: any) {
      toast({
        title: t('friends.errorSend'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const respondToRequest = async (requestId: string, accept: boolean) => {
    try {
      const { error } = await supabase
        .from('friend_requests')
        .update({ status: accept ? 'accepted' : 'rejected' })
        .eq('id', requestId);

      if (error) throw error;

      toast({
        title: accept ? t('friends.requestAccepted') : t('friends.requestDeclined'),
        description: accept ? t('friends.requestAcceptedDesc') : t('friends.requestDeclinedDesc'),
      });

      await Promise.all([
        fetchFriends(currentUser.id),
        fetchPendingRequests(currentUser.id),
      ]);
    } catch (error: any) {
      toast({
        title: t('friends.errorRespond'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const challengeFriend = async (friendUserId: string, tcgType: string) => {
    setChallengeTarget(null);
    try {
      // Verificar se o usuário já está em algum duelo ativo
      const { data: existingDuels } = await supabase
        .from('live_duels')
        .select('id, status')
        .or(`creator_id.eq.${currentUser.id},opponent_id.eq.${currentUser.id}`)
        .in('status', ['waiting', 'in_progress']);

      if (existingDuels && existingDuels.length > 0) {
        toast({
          title: t('friends.alreadyDueling'),
          description: t('friends.alreadyDuelingDesc'),
          variant: "destructive",
        });
        navigate(`/duel/${existingDuels[0].id}`);
        return;
      }

      // Criar duelo casual com tcg_type
      const { data: duelData, error: duelError } = await supabase
        .from('live_duels')
        .insert({
          creator_id: currentUser.id,
          status: 'waiting',
          is_ranked: false,
          tcg_type: tcgType,
        })
        .select()
        .single();

      if (duelError) throw duelError;

      // Criar convite de duelo
      const { data: inviteData, error: inviteError } = await supabase
        .from('duel_invites')
        .insert({
          sender_id: currentUser.id,
          receiver_id: friendUserId,
          duel_id: duelData.id,
          status: 'pending',
        })
        .select()
        .single();

      if (inviteError) {
        console.error('Erro ao criar convite:', inviteError);
      }

      // Enviar push notification para oponente offline
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        // Buscar username do desafiante
        const { data: myProfile } = await supabase
          .from('profiles')
          .select('username')
          .eq('user_id', currentUser.id)
          .single();

        await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            userId: friendUserId,
            title: t('friends.duelInviteTitle'),
            body: t('friends.duelInviteBody', { name: myProfile?.username || t('friends.someone') }),
            data: { type: 'duel_invite', duelId: duelData.id, inviteId: inviteData?.id, url: '/friends' },
          }),
        });
      } catch (pushErr) {
        console.error('Erro ao enviar push:', pushErr);
      }

      // Sincroniza o TCG ativo do criador com o TCG do duelo
      try { localStorage.setItem('activeTcg', tcgType); } catch {}

      toast({
        title: t('friends.challengeSent'),
        description: t('friends.challengeSentDesc'),
      });

      navigate(`/duel/${duelData.id}`);
    } catch (error: any) {
      toast({
        title: t('friends.errorChallenge'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-transparent">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-24 pb-24">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gradient-mystic mb-2">
            {t('friends.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('friends.subtitle')}
          </p>
        </div>

        <Tabs defaultValue="friends" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="friends">
              {t('friends.tabFriends', { count: friends.length })}
            </TabsTrigger>
            <TabsTrigger value="requests">
              {t('friends.tabRequests', { count: pendingRequests.length })}
            </TabsTrigger>
            <TabsTrigger value="search">
              {t('friends.tabSearch')}
            </TabsTrigger>
          </TabsList>

          {/* Friends List */}
          <TabsContent value="friends">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <Card key={i} className="card-mystic animate-pulse">
                    <CardContent className="h-24" />
                  </Card>
                ))}
              </div>
            ) : friends.length === 0 ? (
              <Card className="card-mystic text-center py-12">
                <Users className="w-16 h-16 mx-auto text-primary/50 mb-4" />
                <h3 className="text-xl font-semibold mb-2">{t('friends.noFriends')}</h3>
                <p className="text-muted-foreground mb-4">
                  {t('friends.noFriendsDesc')}
                </p>
              </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {friends.map((friend) => {
                  const friendOnline = isOnline(friend.user_id);
                  return (
                    <Card key={friend.user_id} className="card-mystic hover:border-primary/40 transition-all">
                      <CardContent className="py-6">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                          <div className="flex items-center gap-3 w-full sm:w-auto">
                          <div className="relative shrink-0">
                            <Avatar className="w-12 h-12 sm:w-16 sm:h-16 border-2 border-primary/30">
                              <AvatarImage src={friend.avatar_url || ""} />
                              <AvatarFallback className="bg-primary/20 text-lg">
                                {friend.username?.charAt(0).toUpperCase() || "U"}
                              </AvatarFallback>
                            </Avatar>
                            {friendOnline && (
                              <div className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 border-2 border-background rounded-full" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-base sm:text-lg text-gradient-mystic flex items-center gap-2 truncate">
                              {friend.username}
                              {friendOnline && (
                                <span className="text-xs text-emerald-500 font-normal">{t('friends.onlineLabel')}</span>
                              )}
                            </h3>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              {friendOnline 
                                ? t('friends.online')
                                : t('friends.lastSeen', { date: new Date(friend.last_seen).toLocaleDateString() })
                              }
                            </p>
                          </div>
                          </div>

                          <div className="flex gap-2 shrink-0 w-full sm:w-auto">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/chat/${friend.user_id}`)}
                            >
                              {t('friends.chat')}
                            </Button>
                            <Button
                              size="sm"
                              type="button"
                              onClick={() => setChallengeTarget(prev => prev === friend.user_id ? null : friend.user_id)}
                              className="btn-mystic text-white"
                            >
                              <Swords className="w-4 h-4 mr-1" />
                              {t('friends.challenge')}
                            </Button>
                          </div>
                        </div>

                        {challengeTarget === friend.user_id && (
                          <div className="mt-4 p-3 rounded-lg border border-primary/30 bg-background/70 space-y-2 animate-in fade-in slide-in-from-top-2">
                            <p className="text-sm font-semibold text-center text-gradient-mystic">
                              {t('friends.chooseTcg', 'Escolha o modo de duelo')}
                            </p>
                            <div className="grid grid-cols-1 gap-2">
                              <Button type="button" variant="outline" className="justify-start h-12" onClick={() => challengeFriend(friend.user_id, 'yugioh')}>
                                🃏 YGO Advanced
                              </Button>
                              <Button type="button" variant="outline" className="justify-start h-12" onClick={() => challengeFriend(friend.user_id, 'genesis')}>
                                ⚛️ Genesys
                              </Button>
                              <Button type="button" variant="outline" className="justify-start h-12" onClick={() => challengeFriend(friend.user_id, 'rush_duel')}>
                                ⚡ Rush Duel
                              </Button>
                              <Button type="button" variant="ghost" size="sm" onClick={() => setChallengeTarget(null)}>
                                {t('common.cancel', 'Cancelar')}
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Friend Requests */}
          <TabsContent value="requests">
            {pendingRequests.length === 0 ? (
              <Card className="card-mystic text-center py-12">
                <UserPlus className="w-16 h-16 mx-auto text-primary/50 mb-4" />
                <h3 className="text-xl font-semibold mb-2">{t('friends.noRequests')}</h3>
                <p className="text-muted-foreground">
                  {t('friends.noRequestsDesc')}
                </p>
              </Card>
            ) : (
              <div className="space-y-4">
                {pendingRequests.map((request) => (
                  <Card key={request.id} className="card-mystic">
                    <CardContent className="py-6">
                      <div className="flex items-center gap-4">
                        <Avatar className="w-16 h-16 border-2 border-primary/30">
                          <AvatarImage src={request.requester?.avatar_url || ""} />
                          <AvatarFallback className="bg-primary/20 text-lg">
                            {request.requester?.username?.charAt(0).toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">
                            {request.requester?.username}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {t('friends.wantsToBeFriend')}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            onClick={() => respondToRequest(request.id, true)}
                            variant="default"
                            className="btn-mystic text-white"
                          >
                            <Check className="w-4 h-4 mr-2" />
                            {t('friends.accept')}
                          </Button>
                          <Button
                            onClick={() => respondToRequest(request.id, false)}
                            variant="outline"
                          >
                            <X className="w-4 h-4 mr-2" />
                            {t('friends.decline')}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {sentRequests.length > 0 && (
              <div className="mt-8">
                <h3 className="text-xl font-semibold mb-4">{t('friends.sentRequests')}</h3>
                <div className="space-y-4">
                  {sentRequests.map((request) => (
                    <Card key={request.id} className="card-mystic">
                      <CardContent className="py-6">
                        <div className="flex items-center gap-4">
                          <Avatar className="w-12 h-12">
                            <AvatarImage src={request.addressee?.avatar_url || ""} />
                            <AvatarFallback className="bg-primary/20">
                              {request.addressee?.username?.charAt(0).toUpperCase() || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <h4 className="font-semibold">
                              {request.addressee?.username}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {t('friends.waitingResponse')}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Search Users */}
          <TabsContent value="search">
            <Card className="card-mystic">
              <CardHeader>
                <CardTitle className="text-gradient-mystic">{t('friends.searchTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-6">
                  <Input
                    placeholder={t('friends.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && searchUsers()}
                    className="bg-background/50"
                  />
                  <Button onClick={searchUsers} className="btn-mystic text-white">
                    <Search className="w-4 h-4 mr-2" />
                    {t('friends.searchBtn')}
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <div className="space-y-4">
                    {searchResults.map((user) => {
                      const alreadyFriend = friends.some(f => f.user_id === user.user_id);
                      const requestSent = sentRequests.some(r => r.addressee_id === user.user_id);

                      return (
                        <div key={user.user_id} className="flex items-center gap-4 p-4 rounded-lg bg-background/50">
                          <Avatar className="w-12 h-12">
                            <AvatarImage src={user.avatar_url || ""} />
                            <AvatarFallback className="bg-primary/20">
                              {user.username?.charAt(0).toUpperCase() || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <h4 className="font-semibold">{user.username}</h4>
                            <p className="text-sm text-muted-foreground">
                              {t('friends.elo', { elo: user.elo_rating || 1500 })}
                            </p>
                          </div>
                          {alreadyFriend ? (
                            <span className="text-sm text-primary">{t('friends.alreadyFriend')}</span>
                          ) : requestSent ? (
                            <span className="text-sm text-muted-foreground">{t('friends.requestSent')}</span>
                          ) : (
                            <Button
                              onClick={() => sendFriendRequest(user.user_id)}
                              className="btn-mystic text-white"
                            >
                              <UserPlus className="w-4 h-4 mr-2" />
                              {t('friends.add')}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* TCG Selector Dialog */}
      <Dialog open={!!challengeTarget} onOpenChange={(open) => { if (!open) setChallengeTarget(null); }}>
        <DialogContent className="card-mystic border-primary/30 max-w-sm w-[92vw] sm:w-full p-5 z-[100]">
          <DialogHeader>
            <DialogTitle className="text-center text-xl flex items-center justify-center gap-2">
              <Swords className="w-6 h-6" />
              {t('friends.chooseTcg', 'Escolha o modo de duelo')}
            </DialogTitle>
            <DialogDescription className="text-center">
              {t('friends.chooseTcgDesc', 'Selecione qual versão de Yu-Gi-Oh! deseja jogar')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-2">
            <Button
              type="button"
              onClick={() => { const target = challengeTarget; if (target) challengeFriend(target, 'yugioh'); }}
              className="w-full h-14 text-base sm:text-lg justify-start"
              variant="outline"
            >
              🃏 YGO Advanced
            </Button>
            <Button
              type="button"
              onClick={() => { const target = challengeTarget; if (target) challengeFriend(target, 'genesis'); }}
              className="w-full h-14 text-base sm:text-lg justify-start"
              variant="outline"
            >
              ⚛️ Genesys
            </Button>
            <Button
              type="button"
              onClick={() => { const target = challengeTarget; if (target) challengeFriend(target, 'rush_duel'); }}
              className="w-full h-14 text-base sm:text-lg justify-start"
              variant="outline"
            >
              ⚡ Rush Duel
            </Button>
            <Button type="button" variant="ghost" className="mt-1" onClick={() => setChallengeTarget(null)}>
              {t('common.cancel', 'Cancelar')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Friends;
