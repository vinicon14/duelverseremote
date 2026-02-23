/**
 * DuelVerse - Chat com Amigo
 * Desenvolvido por Vinícius
 * 
 * Chat privado entre amigos com mensagens em tempo real.
 */
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Send } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { notifyNewMessage } from "@/utils/pushNotifications";

export default function FriendChat() {
  const { friendId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [friend, setFriend] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAuth();
  }, [friendId]);

  useEffect(() => {
    if (currentUser && friendId) {
      fetchFriend();
      fetchMessages();
      subscribeToMessages();
    }
  }, [currentUser, friendId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
      return;
    }
    setCurrentUser(session.user);
  };

  const fetchFriend = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', friendId)
        .single();

      if (error) throw error;
      setFriend(data);
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Não foi possível carregar o perfil do amigo",
        variant: "destructive"
      });
      navigate('/friends');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    if (!currentUser || !friendId) return;

    try {
      const { data, error } = await supabase
        .from('private_messages' as any)
        .select('*')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id})`)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        setMessages([]);
        return;
      }
      
      setMessages(data || []);

      // Marcar mensagens como lidas
      await supabase
        .from('private_messages' as any)
        .update({ read: true })
        .eq('receiver_id', currentUser.id)
        .eq('sender_id', friendId)
        .eq('read', false);

    } catch (error: any) {
      console.error('Error fetching messages:', error);
      setMessages([]);
    }
  };

  const subscribeToMessages = () => {
    if (!currentUser || !friendId) return;

    const channel = supabase
      .channel('private_messages_channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
          filter: `receiver_id=eq.${currentUser.id}`
        },
        (payload) => {
          if (payload.new.sender_id === friendId) {
            setMessages(prev => [...prev, payload.new]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || !friendId) return;

    try {
      const { error } = await supabase
        .from('private_messages' as any)
        .insert({
          sender_id: currentUser.id,
          receiver_id: friendId,
          message: newMessage.trim()
        });

      if (error) throw error;

      setNewMessage("");
      await fetchMessages();

      // Enviar notificação push para o destinatário
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', currentUser.id)
        .single();

      if (senderProfile?.username) {
        await notifyNewMessage(friendId, senderProfile.username);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24">
          <div className="text-center">Carregando...</div>
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
          onClick={() => navigate('/friends')}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        <Card className="card-mystic max-w-4xl mx-auto">
          <CardHeader className="border-b">
            <div className="flex items-center gap-4">
              <Avatar className="w-12 h-12">
                <AvatarImage src={friend?.avatar_url} />
                <AvatarFallback>
                  {friend?.username?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-xl">{friend?.username}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {friend?.is_online ? '🟢 Online' : '⚫ Offline'}
                </p>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="p-0">
            <ScrollArea className="h-[500px] p-4">
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12">
                    Nenhuma mensagem ainda. Inicie a conversa!
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.sender_id === currentUser?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg p-3 ${
                            isMine
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          <p className="text-sm break-words">{msg.message}</p>
                          <p className="text-xs opacity-70 mt-1">
                            {new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <form onSubmit={sendMessage} className="border-t p-4">
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  className="flex-1"
                />
                <Button type="submit" className="btn-mystic" disabled={!newMessage.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
