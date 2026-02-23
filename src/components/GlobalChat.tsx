/**
 * DuelVerse - Componente de Chat Global
 * Desenvolvido por Vinícius
 * 
 * Chat global visível na página de listagem de dueloes.
 */
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Send, MessageCircle } from "lucide-react";

interface GlobalMessage {
  id: string;
  message: string;
  created_at: string;
  user_id: string;
  username: string;
  avatar_url?: string;
}

export const GlobalChat = () => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<GlobalMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAuth();
    fetchMessages();

    // Realtime subscription para novas mensagens
    const channel = supabase
      .channel('global-chat')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'global_chat_messages'
        },
        async (payload) => {
          // Buscar dados do usuário junto com a mensagem
          const { data: userData } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('user_id', payload.new.user_id)
            .single();

          const newMsg = {
            ...payload.new,
            username: userData?.username || 'Anônimo',
            avatar_url: userData?.avatar_url
          } as GlobalMessage;

          setMessages(prev => [...prev, newMsg]);
          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('user_id', user.id)
        .single();
      
      setCurrentUser({ ...user, ...profile });
    }
  };

  const fetchMessages = async () => {
    try {
      // Buscar apenas as últimas 30 mensagens
      const { data, error } = await supabase
        .from('global_chat_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;

      // Buscar dados dos usuários
      const userIds = [...new Set(data?.map(msg => msg.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const formattedMessages = data?.map(msg => ({
        id: msg.id,
        message: msg.message,
        created_at: msg.created_at,
        user_id: msg.user_id,
        username: profileMap.get(msg.user_id)?.username || 'Anônimo',
        avatar_url: profileMap.get(msg.user_id)?.avatar_url
      })).reverse() || [];

      setMessages(formattedMessages);
      scrollToBottom();
      
      // Deletar mensagens antigas (manter apenas as últimas 30)
      await cleanupOldMessages();
    } catch (error: any) {
      console.error('Erro ao buscar mensagens:', error);
    }
  };

  const cleanupOldMessages = async () => {
    try {
      // Buscar todas as mensagens ordenadas por data
      const { data: allMessages } = await supabase
        .from('global_chat_messages')
        .select('id, created_at')
        .order('created_at', { ascending: false });

      // Se houver mais de 30, deletar as antigas
      if (allMessages && allMessages.length > 30) {
        const idsToDelete = allMessages.slice(30).map(msg => msg.id);
        await supabase
          .from('global_chat_messages')
          .delete()
          .in('id', idsToDelete);
      }
    } catch (error) {
      console.error('Erro ao limpar mensagens antigas:', error);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      const scrollArea = scrollRef.current;
      if (scrollArea) {
        const scrollViewport = scrollArea.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollViewport) {
          scrollViewport.scrollTop = scrollViewport.scrollHeight;
        }
      }
    }, 100);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !currentUser) return;

    try {
      const { error } = await supabase
        .from('global_chat_messages')
        .insert({
          user_id: currentUser.id,
          message: newMessage.trim()
        });

      if (error) throw error;

      setNewMessage("");
      
      // Limpar mensagens antigas após enviar nova
      await cleanupOldMessages();
    } catch (error: any) {
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="card-mystic h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-gradient-mystic">
          <MessageCircle className="w-5 h-5" />
          Chat Global
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
        <ScrollArea className="flex-1 pr-2 sm:pr-4 min-h-0" ref={scrollRef}>
          <div className="space-y-3 min-w-0">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 min-w-0 ${
                  msg.user_id === currentUser?.id ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                    {msg.username[0]?.toUpperCase()}
                  </div>
                </div>
                <div
                  className={`flex flex-col gap-1 min-w-0 max-w-[calc(100%-48px)] ${
                    msg.user_id === currentUser?.id ? 'items-end' : 'items-start'
                  }`}
                >
                  <span className="text-xs text-muted-foreground truncate max-w-full">
                    {msg.username}
                  </span>
                  <div
                    className={`px-3 py-2 rounded-lg max-w-full ${
                      msg.user_id === currentUser?.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm break-words whitespace-pre-wrap" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{msg.message}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <form onSubmit={sendMessage} className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="bg-background/50"
            maxLength={500}
          />
          <Button type="submit" size="icon" className="btn-mystic text-white flex-shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
