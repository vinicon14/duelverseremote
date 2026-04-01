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
import { Send, MessageCircle, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useAdmin } from "@/hooks/useAdmin";
import { useTcg } from "@/contexts/TcgContext";

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
  const { isAdmin } = useAdmin();
  const { activeTcg } = useTcg();
  const [messages, setMessages] = useState<GlobalMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<{ username: string; user_id: string }[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAuth();
    fetchMessages();

    // Realtime subscription para novas mensagens
    const channel = supabase
      .channel('global-chat-' + activeTcg)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'global_chat_messages',
          filter: `tcg_type=eq.${activeTcg}`
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
          
          // Show notification only if message contains @todos or @username
          const { data: { user } } = await supabase.auth.getUser();
          if (payload.new.user_id !== user?.id) {
            const msgText = (payload.new.message as string) || '';
            const { data: myProfile } = await supabase
              .from('profiles')
              .select('username')
              .eq('user_id', user?.id || '')
              .single();
            const myUsername = myProfile?.username?.toLowerCase() || '';
            const hasMention = msgText.includes('@todos') || 
              (myUsername && msgText.toLowerCase().includes(`@${myUsername}`));
            
            if (hasMention) {
              const senderName = userData?.username || 'Anônimo';
              
              if (Notification.permission === 'granted') {
                new Notification(`💬 ${senderName}`, {
                  body: msgText,
                  icon: userData?.avatar_url || undefined
                });
              }
              
              // Native bridge (Android/Electron)
              const isNativeApp = /DuelVerseApp/i.test(navigator.userAgent);
              const isElectron = !!(window as any).electronAPI?.isElectron;
              if (isNativeApp && (window as any).DuelVerseNative) {
                (window as any).DuelVerseNative.showNotification(`💬 ${senderName}`, msgText);
              } else if (isElectron && (window as any).electronAPI) {
                (window as any).electronAPI.showNotification(`💬 ${senderName}`, msgText);
              }
              
              toast({
                title: `💬 ${senderName}`,
                description: msgText,
                duration: 5000,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTcg]);

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
        .eq('tcg_type', activeTcg)
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
          message: newMessage.trim(),
          tcg_type: activeTcg
        });

      if (error) throw error;

      // Send push notification only if message has @ mentions
      const msgTrimmed = newMessage.trim();
      if (msgTrimmed.includes('@')) {
        try {
          await supabase.functions.invoke('send-push-notification', {
            body: {
              title: '💬 Chat Global',
              body: `${currentUser.username || 'Usuário'}: ${msgTrimmed.substring(0, 100)}`,
              data: { type: 'global_chat', url: '/duels' },
              exclude_user_id: currentUser.id,
            },
          });
        } catch (pushError) {
          console.error('Push notification error:', pushError);
        }
      }

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewMessage(value);

    // Detect @ mention
    const cursorPos = e.target.selectionStart || value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      const query = mentionMatch[1].toLowerCase();
      setMentionQuery(query);
      setShowMentions(true);
      fetchMentionSuggestions(query);
    } else {
      setShowMentions(false);
      setMentionSuggestions([]);
    }
  };

  const fetchMentionSuggestions = async (query: string) => {
    // Always include "todos" option
    const staticOptions: { username: string; user_id: string }[] = [];
    if ('todos'.startsWith(query)) {
      staticOptions.push({ username: 'todos', user_id: 'todos' });
    }

    if (query.length === 0) {
      setMentionSuggestions(staticOptions);
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('user_id, username')
      .ilike('username', `${query}%`)
      .neq('user_id', currentUser?.id || '')
      .limit(5);

    setMentionSuggestions([...staticOptions, ...(data || [])]);
  };

  const handleSelectMention = (username: string) => {
    const cursorPos = inputRef.current?.selectionStart || newMessage.length;
    const textBeforeCursor = newMessage.slice(0, cursorPos);
    const textAfterCursor = newMessage.slice(cursorPos);
    const beforeMention = textBeforeCursor.replace(/@\w*$/, '');
    const updated = `${beforeMention}@${username} ${textAfterCursor}`;
    setNewMessage(updated);
    setShowMentions(false);
    setMentionSuggestions([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const deleteMessage = async (messageId: string) => {
    if (!isAdmin) return;
    
    try {
      const { error } = await supabase
        .from('global_chat_messages')
        .delete()
        .eq('id', messageId);

      if (error) throw error;

      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      
      toast({
        title: "Mensagem excluída",
        description: "A mensagem foi removida com sucesso.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao excluir mensagem",
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
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMessage(msg.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="relative">
          {showMentions && mentionSuggestions.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-40 overflow-y-auto">
              {mentionSuggestions.map((suggestion) => (
                <button
                  key={suggestion.user_id || suggestion.username}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectMention(suggestion.username);
                  }}
                >
                  <span className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {suggestion.username[0]?.toUpperCase()}
                  </span>
                  <span className="truncate">@{suggestion.username}</span>
                </button>
              ))}
            </div>
          )}
          <form onSubmit={sendMessage} className="flex gap-2">
            <Input
              ref={inputRef}
              value={newMessage}
              onChange={handleInputChange}
              placeholder="Digite sua mensagem... Use @ para mencionar"
              className="bg-background/50"
              maxLength={500}
            />
            <Button type="submit" size="icon" className="btn-mystic text-white flex-shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
};
