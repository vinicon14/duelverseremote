/**
 * DuelVerse - Notificação de Chamada de Duelo (Estilo WhatsApp)
 * Desenvolvido por Vinícius
 * 
 * Overlay de tela cheia estilo chamada com áudio configurável.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Phone, PhoneOff, Swords } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface DuelCallInvite {
  id: string;
  sender_id: string;
  duel_id: string;
  sender: {
    username: string;
    avatar_url: string | null;
  };
}

const getYouTubeVideoId = (url: string): string | null => {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&?#]+)/);
  return match ? match[1] : null;
};

export const DuelCallNotification = ({ currentUserId }: { currentUserId?: string }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [invite, setInvite] = useState<DuelCallInvite | null>(null);
  const audioRef = useRef<HTMLIFrameElement | null>(null);
  const [ringtoneUrl, setRingtoneUrl] = useState<string | null>(null);
  const [pulsing, setPulsing] = useState(true);

  // Fetch ringtone URL from admin settings
  useEffect(() => {
    const fetchRingtone = async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'duel_ringtone_url')
        .maybeSingle();
      if (data?.value) setRingtoneUrl(data.value);
    };
    fetchRingtone();
  }, []);

  // Pulse animation interval
  useEffect(() => {
    if (!invite) return;
    const interval = setInterval(() => setPulsing(p => !p), 1500);
    return () => clearInterval(interval);
  }, [invite]);

  const stopAudio = useCallback(() => {
    // Remove iframe to stop audio
    if (audioRef.current) {
      audioRef.current.src = '';
      audioRef.current = null;
    }
  }, []);

  const playRingtone = useCallback(() => {
    if (!ringtoneUrl) return;
    const videoId = getYouTubeVideoId(ringtoneUrl);
    if (!videoId) return;

    // Create hidden YouTube iframe for audio
    const existing = document.getElementById('duel-ringtone-iframe');
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'duel-ringtone-iframe';
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}&controls=0`;
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.allow = 'autoplay';
    document.body.appendChild(iframe);
    audioRef.current = iframe;
  }, [ringtoneUrl]);

  // Listen for new invites
  useEffect(() => {
    if (!currentUserId) return;

    // Check pending invites on mount
    const checkPending = async () => {
      const { data } = await supabase
        .from('duel_invites')
        .select(`*, sender:profiles!duel_invites_sender_id_fkey(username, avatar_url)`)
        .eq('receiver_id', currentUserId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setInvite(data as any);
        playRingtone();
      }
    };
    checkPending();

    // Realtime listener
    const channel = supabase
      .channel(`duel-call-${currentUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'duel_invites',
        filter: `receiver_id=eq.${currentUserId}`,
      }, async (payload) => {
        const { data } = await supabase
          .from('duel_invites')
          .select(`*, sender:profiles!duel_invites_sender_id_fkey(username, avatar_url)`)
          .eq('id', payload.new.id)
          .maybeSingle();

        if (data) {
          setInvite(data as any);
          playRingtone();

          // Try native notification for background/APK
          try {
            const nativeBridge = (window as any).DuelVerseNative;
            if (nativeBridge?.showNotification) {
              nativeBridge.showNotification(
                '⚔️ Desafio de Duelo!',
                `${(data as any).sender?.username || 'Alguém'} te desafiou para um duelo!`
              );
            }
          } catch (e) {}

          // Browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('⚔️ Desafio de Duelo!', {
              body: `${(data as any).sender?.username || 'Alguém'} te desafiou para um duelo!`,
              icon: '/favicon.ico',
              requireInteraction: true,
            });
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, playRingtone]);

  const handleAccept = async () => {
    if (!invite) return;
    stopAudio();

    try {
      await supabase
        .from('duel_invites')
        .update({ status: 'accepted' })
        .eq('id', invite.id);

      setInvite(null);
      navigate(`/duel/${invite.duel_id}`);
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleReject = async () => {
    if (!invite) return;
    stopAudio();

    try {
      await supabase
        .from('duel_invites')
        .update({ status: 'rejected' })
        .eq('id', invite.id);

      // Delete waiting duel
      await supabase
        .from('live_duels')
        .delete()
        .eq('id', invite.duel_id)
        .eq('status', 'waiting');

      setInvite(null);
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  if (!invite) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/95 backdrop-blur-lg">
      {/* Background animated gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/20 via-transparent to-primary/10 animate-pulse pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center">
        {/* Calling label */}
        <p className="text-muted-foreground text-sm uppercase tracking-widest animate-pulse">
          Convite de Duelo
        </p>

        {/* Avatar with pulse ring */}
        <div className="relative">
          <div className={`absolute inset-0 rounded-full border-4 border-primary ${pulsing ? 'scale-125 opacity-0' : 'scale-100 opacity-100'} transition-all duration-1000`} />
          <div className={`absolute inset-0 rounded-full border-2 border-primary/50 ${!pulsing ? 'scale-150 opacity-0' : 'scale-100 opacity-50'} transition-all duration-1000`} />
          <Avatar className="w-32 h-32 border-4 border-primary/60 shadow-2xl shadow-primary/30">
            <AvatarImage src={invite.sender.avatar_url || ""} />
            <AvatarFallback className="bg-primary/20 text-4xl font-bold">
              {invite.sender.username?.charAt(0).toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Caller name */}
        <div>
          <h2 className="text-3xl font-bold text-foreground">
            {invite.sender.username}
          </h2>
          <p className="text-primary text-lg mt-1 flex items-center justify-center gap-2">
            <Swords className="w-5 h-5" />
            Te desafiou para um Duelo!
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-16 mt-8">
          {/* Reject */}
          <button
            onClick={handleReject}
            className="flex flex-col items-center gap-3 group"
          >
            <div className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center shadow-lg shadow-destructive/40 group-hover:scale-110 transition-transform group-active:scale-95">
              <PhoneOff className="w-7 h-7 text-white" />
            </div>
            <span className="text-sm text-muted-foreground">Recusar</span>
          </button>

          {/* Accept */}
          <button
            onClick={handleAccept}
            className="flex flex-col items-center gap-3 group"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/40 group-hover:scale-110 transition-transform group-active:scale-95 animate-bounce">
              <Phone className="w-7 h-7 text-white" />
            </div>
            <span className="text-sm text-muted-foreground">Aceitar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
