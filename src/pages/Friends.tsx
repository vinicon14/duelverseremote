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

const Friends = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [sentRequests, setSentRequests] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
        title: "Erro ao buscar usuários",
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
        title: "Pedido enviado!",
        description: "Aguarde a aceitação do usuário.",
      });

      await fetchSentRequests(currentUser.id);
      setSearchResults([]);
      setSearchQuery("");
    } catch (error: any) {
      let errorMessage = "Ocorreu um erro. Tente novamente.";
      
      if (error.message?.includes('duplicate key') || error.message?.includes('already_friends')) {
        errorMessage = "Vocês já são amigos!";
      } else if (error.message?.includes('foreign key violation') || error.message?.includes('invalid input')) {
        errorMessage = "Usuário não encontrado.";
      } else if (error.message?.includes('permission denied') || error.message?.includes('RLS')) {
        errorMessage = "Erro de permissão. Faça login novamente.";
      }
      
      toast({
        title: "Erro ao enviar pedido",
        description: errorMessage,
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
        title: accept ? "Pedido aceito!" : "Pedido recusado",
        description: accept ? "Vocês agora são amigos!" : "O pedido foi recusado.",
      });

      await Promise.all([
        fetchFriends(currentUser.id),
        fetchPendingRequests(currentUser.id),
      ]);
    } catch (error: any) {
      toast({
        title: "Erro ao responder pedido",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const challengeFriend = async (friendUserId: string) => {
    try {
      // Verificar se o usuário já está em algum duelo ativo
      const { data: existingDuels } = await supabase
        .from('live_duels')
        .select('id, status')
        .or(`creator_id.eq.${currentUser.id},opponent_id.eq.${currentUser.id}`)
        .in('status', ['waiting', 'in_progress']);

      if (existingDuels && existingDuels.length > 0) {
        toast({
          title: "Você já está em um duelo",
          description: "Termine ou saia do duelo atual antes de desafiar um amigo.",
          variant: "destructive",
        });
        navigate(`/duel/${existingDuels[0].id}`);
        return;
      }

      // Verificar se o amigo já está em algum duelo ativo
      const { data: friendDuels } = await supabase
        .from('live_duels')
        .select('id, status')
        .or(`creator_id.eq.${friendUserId},opponent_id.eq.${friendUserId}`)
        .in('status', ['waiting', 'in_progress']);

      if (friendDuels && friendDuels.length > 0) {
        toast({
          title: "Amigo ocupado",
          description: "Seu amigo já está em um duelo ativo. Aguarde ele terminar.",
          variant: "destructive",
        });
        return;
      }

      const { data: duelData, error: duelError } = await supabase
        .from('live_duels')
        .insert({
          creator_id: currentUser.id,
          status: 'waiting',
          is_ranked: false,
        })
        .select()
        .single();

      if (duelError) {
        if (duelError.message?.includes('too many')) {
          toast({
            title: "Limite atingido",
            description: "Você criou muitos duelos recentemente. Aguarde um momento.",
            variant: "destructive",
          });
        } else {
          throw duelError;
        }
        return;
      }

      const { error: inviteError } = await supabase
        .from('duel_invites')
        .insert({
          sender_id: currentUser.id,
          receiver_id: friendUserId,
          duel_id: duelData.id,
          status: 'pending',
        });

      if (inviteError) {
        await supabase.from('live_duels').delete().eq('id', duelData.id);
        toast({
          title: "Não foi possível enviar o desafio",
          description: "Tente novamente em alguns segundos.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Desafio enviado!",
        description: `Desafio enviado para ${friends.find(f => f.user_id === friendUserId)?.username || 'seu amigo'}. Aguarde na sala de duelo!`,
      });

      navigate(`/duel/${duelData.id}`);
    } catch (error: any) {
      if (!error.message?.includes('too many')) {
        toast({
          title: "Erro ao criar desafio",
          description: "Não foi possível enviar o desafio. Tente novamente.",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gradient-mystic mb-2">
            Amigos
          </h1>
          <p className="text-muted-foreground">
            Gerencie suas amizades e desafie outros duelistas
          </p>
        </div>

        <Tabs defaultValue="friends" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="friends">
              Amigos ({friends.length})
            </TabsTrigger>
            <TabsTrigger value="requests">
              Pedidos ({pendingRequests.length})
            </TabsTrigger>
            <TabsTrigger value="search">
              Adicionar amigos
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
                <h3 className="text-xl font-semibold mb-2">Nenhum amigo ainda</h3>
                <p className="text-muted-foreground mb-4">
                  Busque usuários e adicione seus primeiros amigos!
                </p>
              </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {friends.map((friend) => {
                  const friendOnline = isOnline(friend.user_id);
                  return (
                    <Card key={friend.user_id} className="card-mystic hover:border-primary/40 transition-all">
                      <CardContent className="py-6">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <Avatar className="w-16 h-16 border-2 border-primary/30">
                              <AvatarImage src={friend.avatar_url || ""} />
                              <AvatarFallback className="bg-primary/20 text-lg">
                                {friend.username?.charAt(0).toUpperCase() || "U"}
                              </AvatarFallback>
                            </Avatar>
                            {friendOnline && (
                              <div className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 border-2 border-background rounded-full" />
                            )}
                          </div>

                          <div className="flex-1">
                            <h3 className="font-semibold text-lg text-gradient-mystic flex items-center gap-2">
                              {friend.username}
                              {friendOnline && (
                                <span className="text-xs text-emerald-500 font-normal">● Online</span>
                              )}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {friendOnline 
                                ? 'Online agora' 
                                : `Visto ${new Date(friend.last_seen).toLocaleDateString()}`
                              }
                            </p>
                          </div>

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => navigate(`/chat/${friend.user_id}`)}
                            >
                              💬 Chat
                            </Button>
                            <Button
                              onClick={() => challengeFriend(friend.user_id)}
                              className="btn-mystic text-white"
                              disabled={!friendOnline}
                            >
                              <Swords className="w-4 h-4 mr-2" />
                              Desafiar
                            </Button>
                          </div>
                        </div>
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
                <h3 className="text-xl font-semibold mb-2">Nenhum pedido pendente</h3>
                <p className="text-muted-foreground">
                  Você não tem pedidos de amizade no momento
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
                            Quer ser seu amigo
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            onClick={() => respondToRequest(request.id, true)}
                            variant="default"
                            className="btn-mystic text-white"
                          >
                            <Check className="w-4 h-4 mr-2" />
                            Aceitar
                          </Button>
                          <Button
                            onClick={() => respondToRequest(request.id, false)}
                            variant="outline"
                          >
                            <X className="w-4 h-4 mr-2" />
                            Recusar
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
                <h3 className="text-xl font-semibold mb-4">Pedidos Enviados</h3>
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
                              Aguardando resposta...
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
                <CardTitle className="text-gradient-mystic">Buscar Duelistas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-6">
                  <Input
                    placeholder="Digite o nome do usuário..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && searchUsers()}
                    className="bg-background/50"
                  />
                  <Button onClick={searchUsers} className="btn-mystic text-white">
                    <Search className="w-4 h-4 mr-2" />
                    Buscar
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
                              ELO: {user.elo_rating || 1500}
                            </p>
                          </div>
                          {alreadyFriend ? (
                            <span className="text-sm text-primary">✓ Amigo</span>
                          ) : requestSent ? (
                            <span className="text-sm text-muted-foreground">Pedido enviado</span>
                          ) : (
                            <Button
                              onClick={() => sendFriendRequest(user.user_id)}
                              className="btn-mystic text-white"
                            >
                              <UserPlus className="w-4 h-4 mr-2" />
                              Adicionar
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
    </div>
  );
};

export default Friends;
