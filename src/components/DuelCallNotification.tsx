/**
 * DuelVerse - Notificação de Chamada de Duelo (Estilo WhatsApp)
 * Desenvolvido por Vinícius
 * 
 * Overlay de tela cheia estilo chamada com áudio por TCG.
 * Toca o áudio configurado no admin (MP3/WAV) ou fallback com Web Audio API.
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
  duel?: {
    tcg_type: string;
  };
}

// Rebranding: chaves internas mantidas, somente o display muda.
const TCG_LABELS: Record<string, string> = {
  yugioh: '🃏 Advanced',
  magic: '⚛️ Genesis',
  pokemon: '⚡ Rush',
};

const TCG_FULL: Record<string, string> = {
  yugioh: 'YGO Advanced',
  magic: 'Genesis',
  pokemon: 'Rush Duel',
};

const TCG_SETTINGS_KEY: Record<string, string> = {
  yugioh: 'ringtone_ygo',
  magic: 'ringtone_mtg',
  pokemon: 'ringtone_pkm',
};

// Fallback frequencies for different TCG ringtones
const TCG_TONES: Record<string, number[]> = {
  yugioh: [523, 659, 784, 659, 523, 784],
  magic: [440, 523, 660, 523, 440, 660],
  pokemon: [587, 740, 880, 740, 587, 880],
};

export const DuelCallNotification = ({ currentUserId }: { currentUserId?: string }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [invite, setInvite] = useState<DuelCallInvite | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pulsing, setPulsing] = useState(true);
  const [ringtoneUrls, setRingtoneUrls] = useState<Record<string, string>>({});

  // Fetch ringtone URLs from system_settings once
  useEffect(() => {
    const fetchRingtones = async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['ringtone_ygo', 'ringtone_mtg', 'ringtone_pkm']);
      if (data) {
        const urls: Record<string, string> = {};
        data.forEach(s => { if (s.value) urls[s.key] = s.value; });
        setRingtoneUrls(urls);
      }
    };
    fetchRingtones();
  }, []);

  useEffect(() => {
    if (!invite) return;
    const interval = setInterval(() => setPulsing(p => !p), 1500);
    return () => clearInterval(interval);
  }, [invite]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
      audioIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
  }, []);

  const playTone = useCallback((ctx: AudioContext, frequency: number, startTime: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, startTime + duration - 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }, []);

  const playFallbackTones = useCallback((tcgType: string) => {
    const tones = TCG_TONES[tcgType] || TCG_TONES.yugioh;
    const playSequence = () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = ctx;
        const noteDuration = 0.25;
        const gap = 0.1;
        tones.forEach((freq, i) => {
          playTone(ctx, freq, ctx.currentTime + i * (noteDuration + gap), noteDuration);
        });
      } catch (e) {
        console.error('Audio playback error:', e);
      }
    };
    playSequence();
    audioIntervalRef.current = setInterval(playSequence, 2500);
  }, [playTone]);

  const playRingtone = useCallback((tcgType: string) => {
    stopAudio();

    const settingsKey = TCG_SETTINGS_KEY[tcgType] || 'ringtone_ygo';
    const rawAudioUrl = ringtoneUrls[settingsKey];
    const audioUrl = rawAudioUrl?.split('?t=')[0] || rawAudioUrl;

    if (audioUrl) {
      try {
        const audio = new Audio(audioUrl);
        audio.loop = true;
        audio.volume = 1;
        audio.preload = 'auto';
        audio.crossOrigin = 'anonymous';
        audioRef.current = audio;

        audio.play().catch((err) => {
          console.warn('Failed to play uploaded ringtone, falling back to tones:', err);
          playFallbackTones(tcgType);
        });
        return;
      } catch (e) {
        console.warn('Error creating Audio element:', e);
      }
    }

    playFallbackTones(tcgType);
  }, [stopAudio, ringtoneUrls, playFallbackTones]);

  useEffect(() => {
    if (!invite) return;
    const tcg = invite.duel?.tcg_type || 'yugioh';
    const settingsKey = TCG_SETTINGS_KEY[tcg] || 'ringtone_ygo';
    if (ringtoneUrls[settingsKey]) {
      playRingtone(tcg);
    }
  }, [invite, ringtoneUrls, playRingtone]);

  useEffect(() => {
    if (!currentUserId) return;

    const fetchInviteWithDuel = async (inviteId: string) => {
      const { data: inviteData, error } = await supabase
        .from('duel_invites')
        .select('*')
        .eq('id', inviteId)
        .maybeSingle();
      if (error || !inviteData) {
        console.error('Error fetching invite:', error);
        return null;
      }
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('user_id', inviteData.sender_id)
        .maybeSingle();
      const { data: duelData } = await supabase
        .from('live_duels')
        .select('tcg_type')
        .eq('id', inviteData.duel_id)
        .maybeSingle();
      return { ...inviteData, sender: senderProfile, duel: duelData };
    };

    const checkPending = async () => {
      const { data: pendingInvites, error } = await supabase
        .from('duel_invites')
        .select('*')
        .eq('receiver_id', currentUserId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error checking pending invites:', error);
        return;
      }

      if (pendingInvites && pendingInvites.length > 0) {
        const inv = pendingInvites[0];
        const fullData = await fetchInviteWithDuel(inv.id);
        if (fullData && fullData.sender) {
          console.log('📞 Pending duel invite found:', fullData);
          const tcg = fullData.duel?.tcg_type || 'yugioh';
          setInvite({
            id: fullData.id,
            sender_id: fullData.sender_id,
            duel_id: fullData.duel_id,
            sender: fullData.sender,
            duel: { tcg_type: tcg },
          });
          playRingtone(tcg);
        }
      }
    };
    checkPending();

    // Listen for service worker messages (accept duel from push notification)
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ACCEPT_DUEL' && event.data.duelId) {
        stopAudio();
        setInvite(null);
        navigate(`/duel/${event.data.duelId}`);
      }
      if (event.data?.type === 'DUEL_INVITE_RECEIVED' && event.data.inviteId) {
        // Re-fetch the invite to show overlay
        fetchInviteWithDuel(event.data.inviteId).then(data => {
          if (data && data.sender) {
            const tcg = data.duel?.tcg_type || 'yugioh';
            setInvite({
              id: data.id,
              sender_id: data.sender_id,
              duel_id: data.duel_id,
              sender: data.sender,
              duel: { tcg_type: tcg },
            });
            playRingtone(tcg);
          }
        });
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSWMessage);

    const channel = supabase
      .channel(`duel-call-${currentUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'duel_invites',
        filter: `receiver_id=eq.${currentUserId}`,
      }, async (payload) => {
        console.log('📞 New duel invite received:', payload.new);
        const data = await fetchInviteWithDuel(payload.new.id);
        if (data && data.sender) {
          const tcg = data.duel?.tcg_type || 'yugioh';
          
          setInvite({
            id: data.id,
            sender_id: data.sender_id,
            duel_id: data.duel_id,
            sender: data.sender,
            duel: { tcg_type: tcg },
          });
          playRingtone(tcg);

          // Native notification bridge
          try {
            const nativeBridge = (window as any).DuelVerseNative;
            if (nativeBridge?.showNotification) {
              nativeBridge.showNotification(
                '⚔️ Desafio de Duelo!',
                `${data.sender?.username || 'Alguém'} te desafiou para um duelo!`
              );
            }
          } catch (e) {}

          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('⚔️ Desafio de Duelo!', {
              body: `${data.sender?.username || 'Alguém'} te desafiou para um duelo!`,
              icon: '/favicon.ico',
              requireInteraction: true,
            });
          }
        }
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel);
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
      stopAudio();
    };
  }, [currentUserId, playRingtone, stopAudio, navigate]);

  // Auto-dismiss after 60 seconds
  useEffect(() => {
    if (!invite) return;
    const timeout = setTimeout(() => {
      stopAudio();
      setInvite(null);
    }, 60000);
    return () => clearTimeout(timeout);
  }, [invite, stopAudio]);

  const handleAccept = async () => {
    if (!invite) return;
    stopAudio();
    try {
      await supabase.from('duel_invites').update({ status: 'accepted' }).eq('id', invite.id);
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
      await supabase.from('duel_invites').update({ status: 'rejected' }).eq('id', invite.id);
      await supabase.from('live_duels').delete().eq('id', invite.duel_id).eq('status', 'waiting');
      setInvite(null);
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  if (!invite) return null;

  const tcgType = invite.duel?.tcg_type || 'yugioh';

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/95 backdrop-blur-lg">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/20 via-transparent to-primary/10 animate-pulse pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center">
        {/* TCG Badge */}
        <div className="px-4 py-1.5 rounded-full bg-primary/20 border border-primary/40 text-primary font-semibold text-sm">
          {TCG_LABELS[tcgType] || tcgType}
        </div>

        <p className="text-muted-foreground text-sm uppercase tracking-widest animate-pulse">
          Convite de Duelo
        </p>

        {/* Avatar */}
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

        <div>
          <h2 className="text-3xl font-bold text-white">{invite.sender.username}</h2>
          <p className="text-primary text-lg mt-1 flex items-center justify-center gap-2">
            <Swords className="w-5 h-5" />
            Duelo de {TCG_FULL[tcgType] || tcgType}
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-16 mt-8">
          <button onClick={handleReject} className="flex flex-col items-center gap-3 group">
            <div className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center shadow-lg shadow-destructive/40 group-hover:scale-110 transition-transform group-active:scale-95">
              <PhoneOff className="w-7 h-7 text-destructive-foreground" />
            </div>
            <span className="text-sm text-muted-foreground">Recusar</span>
          </button>

          <button onClick={handleAccept} className="flex flex-col items-center gap-3 group">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/40 group-hover:scale-110 transition-transform group-active:scale-95 animate-bounce">
              <Phone className="w-7 h-7 text-primary-foreground" />
            </div>
            <span className="text-sm text-muted-foreground">Aceitar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
