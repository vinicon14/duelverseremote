import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Send, MessageCircle, Trash2, ExternalLink, Link2 } from "lucide-react";
import { useAdmin } from "@/hooks/useAdmin";
import { useTcg } from "@/contexts/TcgContext";
import { DiscordLinkCard } from "@/components/DiscordLinkCard";

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
  const [bridgeEnabled, setBridgeEnabled] = useState(false);
  const [inviteLink, setInviteLink] = useState("https://discord.gg/A7GqCGNGNn");
  const [discordDialogOpen, setDiscordDialogOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const userLanguage = (typeof window !== "undefined" ? localStorage.getItem("userLanguage") : null) || "en";

  useEffect(() => {
    checkAuth();
    fetchMessages();

    const channel = supabase
      .channel(`global-chat-${activeTcg}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "global_chat_messages",
          filter: `tcg_type=eq.${activeTcg}`,
        },
        async (payload) => {
          const { data: userData } = await supabase
            .from("profiles")
            .select("username, avatar_url")
            .eq("user_id", payload.new.user_id)
            .single();

          const newMsg = {
            ...payload.new,
            username: userData?.username || "Anônimo",
            avatar_url: userData?.avatar_url,
          } as GlobalMessage;

          setMessages((prev) => [...prev, newMsg]);
          scrollToBottom();

          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (payload.new.user_id !== user?.id) {
            const msgText = (payload.new.message as string) || "";
            const { data: myProfile } = await supabase
              .from("profiles")
              .select("username")
              .eq("user_id", user?.id || "")
              .single();

            const myUsername = myProfile?.username?.toLowerCase() || "";
            const hasMention = msgText.includes("@todos") || (myUsername && msgText.toLowerCase().includes(`@${myUsername}`));

            if (hasMention) {
              const senderName = userData?.username || "Anônimo";

              if (Notification.permission === "granted") {
                new Notification(`💬 ${senderName}`, {
                  body: msgText,
                  icon: userData?.avatar_url || undefined,
                });
              }

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
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTcg, toast]);

  const fetchDiscordServers = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discord-bridge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ type: "get_config" }),
      });

      const config = await response.json();
      if (config.bridgeEnabled) {
        setBridgeEnabled(true);
      }
      if (config.inviteLink) {
        setInviteLink(config.inviteLink);
      }
    } catch (error) {
      console.error("Erro ao buscar configurações Discord:", error);
    }
  };

  useEffect(() => {
    fetchDiscordServers();
  }, []);

  const checkAuth = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("user_id", user.id)
        .single();

      setCurrentUser({ ...user, ...profile });
    }
  };

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from("global_chat_messages")
        .select("*")
        .eq("tcg_type", activeTcg)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;

      const userIds = [...new Set(data?.map((message) => message.user_id) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, username, avatar_url")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((profile) => [profile.user_id, profile]) || []);

      const formattedMessages =
        data?.map((message) => ({
          id: message.id,
          message: message.message,
          created_at: message.created_at,
          user_id: message.user_id,
          username: profileMap.get(message.user_id)?.username || "Anônimo",
          avatar_url: profileMap.get(message.user_id)?.avatar_url,
        })).reverse() || [];

      setMessages(formattedMessages);
      scrollToBottom();
    } catch (error) {
      console.error("Erro ao buscar mensagens:", error);
    }
  };

  const cleanupOldMessages = async () => {
    try {
      const { data: allMessages } = await supabase
        .from("global_chat_messages")
        .select("id, created_at")
        .order("created_at", { ascending: false });

      if (allMessages && allMessages.length > 30) {
        const idsToDelete = allMessages.slice(30).map((message) => message.id);
        await supabase.from("global_chat_messages").delete().in("id", idsToDelete);
      }
    } catch (error) {
      console.error("Erro ao limpar mensagens antigas:", error);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      const scrollArea = scrollRef.current;
      if (scrollArea) {
        const scrollViewport = scrollArea.querySelector("[data-radix-scroll-area-viewport]");
        if (scrollViewport) {
          scrollViewport.scrollTop = scrollViewport.scrollHeight;
        }
      }
    }, 100);
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!newMessage.trim() || !currentUser) return;

    try {
      const content = newMessage.trim();
      const { error } = await supabase.from("global_chat_messages").insert({
        user_id: currentUser.id,
        message: content,
        tcg_type: activeTcg,
        language_code: userLanguage,
      });

      if (error) throw error;

      if (bridgeEnabled) {
        try {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discord-bridge`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              type: "chat_to_discord",
              username: currentUser.username,
              content,
              userId: currentUser.id,
            }),
          });
        } catch (bridgeError) {
          console.error("Erro ao enviar para Discord:", bridgeError);
        }
      }

      setNewMessage("");
      await cleanupOldMessages();
    } catch (error: any) {
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setNewMessage(value);

    const cursorPos = event.target.selectionStart || value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@([\w\u00C0-\u024F]*)$/);

    if (mentionMatch) {
      const query = mentionMatch[1].toLowerCase();
      setShowMentions(true);
      fetchMentionSuggestions(query);
    } else {
      setShowMentions(false);
      setMentionSuggestions([]);
    }
  };

  const fetchMentionSuggestions = async (query: string) => {
    const staticOptions: { username: string; user_id: string }[] = [];
    if ("todos".startsWith(query)) {
      staticOptions.push({ username: "todos", user_id: "todos" });
    }

    if (query.length === 0) {
      setMentionSuggestions(staticOptions);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("user_id, username")
      .ilike("username", `${query}%`)
      .neq("user_id", currentUser?.id || "")
      .limit(5);

    setMentionSuggestions([...staticOptions, ...(data || [])]);
  };

  const handleSelectMention = (username: string) => {
    const cursorPos = inputRef.current?.selectionStart || newMessage.length;
    const textBeforeCursor = newMessage.slice(0, cursorPos);
    const textAfterCursor = newMessage.slice(cursorPos);
    const beforeMention = textBeforeCursor.replace(/@[\w\u00C0-\u024F]*$/, "");
    const updated = `${beforeMention}@${username} ${textAfterCursor}`;
    setNewMessage(updated);
    setShowMentions(false);
    setMentionSuggestions([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const deleteMessage = async (messageId: string) => {
    if (!isAdmin) return;

    try {
      const { error } = await supabase.from("global_chat_messages").delete().eq("id", messageId);
      if (error) throw error;

      setMessages((prev) => prev.filter((message) => message.id !== messageId));
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

  const handleOpenDiscordConnect = () => {
    if (!currentUser) {
      toast({
        title: "Faça login primeiro",
        description: "Entre na sua conta para vincular o Discord.",
        variant: "destructive",
      });
      return;
    }

    setDiscordDialogOpen(true);
  };

  return (
    <>
      <Card className="card-mystic flex h-full flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-gradient-mystic">
              <MessageCircle className="h-5 w-5" />
              Chat Global
            </CardTitle>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs">
                  <ExternalLink className="mr-1 h-3 w-3" />
                  Discord
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => window.open(inviteLink || "https://discord.gg/A7GqCGNGNn", "_blank", "noopener,noreferrer")}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Entrar no Discord
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleOpenDiscordConnect}>
                  <Link2 className="mr-2 h-4 w-4" />
                  Conectar conta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden">
          <ScrollArea className="min-h-0 flex-1 pr-2 sm:pr-4" ref={scrollRef}>
            <div className="min-w-0 space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex min-w-0 gap-2 ${message.user_id === currentUser?.id ? "flex-row-reverse" : "flex-row"}`}
                >
                  <div className="flex-shrink-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold">
                      {message.username[0]?.toUpperCase()}
                    </div>
                  </div>
                  <div
                    className={`flex max-w-[calc(100%-48px)] min-w-0 flex-col gap-1 ${message.user_id === currentUser?.id ? "items-end" : "items-start"}`}
                  >
                    <span className="max-w-full truncate text-xs text-muted-foreground">{message.username}</span>
                    <div
                      className={`max-w-full rounded-lg px-3 py-2 ${message.user_id === currentUser?.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    >
                      <p className="break-words whitespace-pre-wrap text-sm" style={{ wordBreak: "break-word", overflowWrap: "break-word" }}>
                        {message.message}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(message.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMessage(message.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="relative">
            {showMentions && mentionSuggestions.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 z-[9999] mb-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg touch-auto">
                {mentionSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.user_id || suggestion.username}
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground active:bg-accent"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      handleSelectMention(suggestion.username);
                    }}
                  >
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold">
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
              <Button type="submit" size="icon" className="btn-mystic flex-shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      <Dialog open={discordDialogOpen} onOpenChange={setDiscordDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar conta Discord</DialogTitle>
            <DialogDescription>
              Vincule sua conta para espelhar mensagens entre o Discord e o chat global com sua identidade.
            </DialogDescription>
          </DialogHeader>
          <DiscordLinkCard embedded />
        </DialogContent>
      </Dialog>
    </>
  );
};