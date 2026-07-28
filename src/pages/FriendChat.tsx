/**
 * DuelVerse - Chat com Amigo
 * Layout estilo WhatsApp no mobile: header fixo, mensagens, composer fixo.
 */
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Send } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { notifyNewMessage } from "@/utils/pushNotifications";

export default function FriendChat() {
  const { friendId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [friend, setFriend] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { checkAuth(); }, [friendId]);

  useEffect(() => {
    if (currentUser && friendId) {
      fetchFriend();
      fetchMessages();
      const cleanup = subscribeToMessages();
      return cleanup;
    }
  }, [currentUser, friendId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate('/auth'); return; }
    setCurrentUser(session.user);
  };

  const fetchFriend = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles').select('*').eq('user_id', friendId).single();
      if (error) throw error;
      setFriend(data);
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar o perfil do amigo", variant: "destructive" });
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
      if (error) { setMessages([]); return; }
      setMessages(data || []);
      await supabase.from('private_messages' as any)
        .update({ read: true })
        .eq('receiver_id', currentUser.id)
        .eq('sender_id', friendId)
        .eq('read', false);
    } catch {
      setMessages([]);
    }
  };

  const subscribeToMessages = () => {
    if (!currentUser || !friendId) return;
    const channel = supabase
      .channel('private_messages_channel')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'private_messages',
        filter: `receiver_id=eq.${currentUser.id}`
      }, (payload) => {
        if (payload.new.sender_id === friendId) {
          setMessages(prev => [...prev, payload.new]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || !friendId) return;
    const text = newMessage.trim();
    try {
      const { error } = await supabase.from('private_messages' as any).insert({
        sender_id: currentUser.id, receiver_id: friendId, message: text
      });
      if (error) throw error;
      setNewMessage("");
      await fetchMessages();
      const { data: senderProfile } = await supabase
        .from('profiles').select('username').eq('user_id', currentUser.id).single();
      if (senderProfile?.username) {
        await notifyNewMessage(friendId, senderProfile.username);
      }
    } catch (error: any) {
      toast({ title: "Erro ao enviar mensagem", description: error.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent">
        {!isMobile && <Navbar />}
        <div className="flex items-center justify-center min-h-screen">Carregando...</div>
      </div>
    );
  }

  // ---------- MOBILE: WhatsApp-style full screen ----------
  if (isMobile) {
    return (
      <div className="fixed inset-0 flex flex-col bg-background z-40">
        {/* Header */}
        <header className="flex items-center gap-3 px-3 py-2 border-b border-border/40 bg-card/80 backdrop-blur-sm shrink-0"
                style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
          <Button variant="ghost" size="icon" onClick={() => navigate('/friends')} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Avatar className="w-10 h-10 shrink-0">
            <AvatarImage src={friend?.avatar_url} />
            <AvatarFallback>{friend?.username?.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate">{friend?.username}</div>
            <div className="text-xs text-muted-foreground truncate">
              {friend?.is_online ? 'online' : 'offline'}
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 [-webkit-overflow-scrolling:touch]">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-12 text-sm">
              Nenhuma mensagem ainda. Diga oi!
            </div>
          ) : (
            messages.map((msg, i) => {
              const isMine = msg.sender_id === currentUser?.id;
              const prev = messages[i - 1];
              const groupStart = !prev || prev.sender_id !== msg.sender_id;
              return (
                <div key={msg.id}
                     className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${groupStart ? 'mt-2' : ''}`}>
                  <div
                    className={`max-w-[78%] px-3 py-1.5 text-sm shadow-sm break-words ${
                      isMine
                        ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-md'
                        : 'bg-muted text-foreground rounded-2xl rounded-bl-md'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.message}</p>
                    <span className={`block text-[10px] mt-0.5 opacity-70 ${isMine ? 'text-right' : ''}`}>
                      {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <form onSubmit={sendMessage}
              className="flex items-end gap-2 p-2 border-t border-border/40 bg-card/80 backdrop-blur-sm shrink-0"
              style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Mensagem"
            className="flex-1 rounded-full bg-background/70"
          />
          <Button type="submit" size="icon" className="rounded-full btn-mystic shrink-0" disabled={!newMessage.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    );
  }

  // ---------- DESKTOP: original card layout ----------
  return (
    <div className="min-h-screen bg-transparent">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-12">
        <Button variant="ghost" onClick={() => navigate('/friends')} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>

        <div className="card-mystic rounded-xl max-w-4xl mx-auto flex flex-col">
          <div className="flex items-center gap-4 p-4 border-b border-border/40">
            <Avatar className="w-12 h-12">
              <AvatarImage src={friend?.avatar_url} />
              <AvatarFallback>{friend?.username?.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="text-xl font-semibold">{friend?.username}</div>
              <p className="text-sm text-muted-foreground">
                {friend?.is_online ? '🟢 Online' : '⚫ Offline'}
              </p>
            </div>
          </div>

          <div className="h-[500px] overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                Nenhuma mensagem ainda. Inicie a conversa!
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.sender_id === currentUser?.id;
                return (
                  <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-lg p-3 ${isMine ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      <p className="text-sm break-words whitespace-pre-wrap">{msg.message}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage} className="border-t border-border/40 p-4 flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Digite sua mensagem..."
              className="flex-1"
            />
            <Button type="submit" className="btn-mystic" disabled={!newMessage.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
