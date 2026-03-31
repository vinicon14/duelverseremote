/**
 * DuelVerse - Notificação de Chamada de Duelo (Estilo WhatsApp)
 * Desenvolvido por Vinícius
 * 
 * Overlay de tela cheia estilo chamada com áudio por TCG.
 * Usa Web Audio API para tocar o ringtone (funciona sem interação prévia).
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

const TCG_LABELS: Record<string, string> = {
  yugioh: '🎴 YGO',
  magic: '🧙 MTG',
  pokemon: '⚡ PKM',
};

const TCG_FULL: Record<string, string> = {
  yugioh: 'Yu-Gi-Oh!',
  magic: 'Magic: The Gathering',
  pokemon: 'Pokémon TCG',
};

// Frequencies for different TCG ringtones
const TCG_TONES: Record<string, number[]> = {
  yugioh: [523, 659, 784, 659, 523, 784],   // C5 E5 G5 heroic
  magic: [440, 523, 660, 523, 440, 660],     // A4 C5 E5 mystical
  pokemon: [587, 740, 880, 740, 587, 880],   // D5 F#5 A5 energetic
};

export const DuelCallNotification = ({ currentUserId }: { currentUserId?: string }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [invite, setInvite] = useState<DuelCallInvite | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pulsing, setPulsing] = useState(true);

  useEffect(() => {
    if (!invite) return;
    const interval = setInterval(() => setPulsing(p => !p), 1500);
    return () => clearInterval(interval);
  }, [invite]);

  const stopAudio = useCallback(() => {
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

  const playRingtone = useCallback((tcgType: string) => {
    stopAudio();
    
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
    
    // Play immediately and repeat every 2.5 seconds
    playSequence();
    audioIntervalRef.current = setInterval(playSequence, 2500);
  }, [stopAudio, playTone]);

  useEffect(() => {
    if (!currentUserId) return;

    const fetchInviteWithDuel = async (inviteId: string) => {
      const { data, error } = await supabase
        .from('duel_invites')
        .select(`*, sender:profiles!duel_invites_sender_id_fkey(username, avatar_url), duel:live_duels!duel_invites_duel_id_fkey(tcg_type)`)
        .eq('id', inviteId)
        .maybeSingle();
      if (error) console.error('Error fetching invite:', error);
      return data;
    };

    const checkPending = async () => {
      const { data, error } = await supabase
        .from('duel_invites')
        .select(`*, sender:profiles!duel_invites_sender_id_fkey(username, avatar_url), duel:live_duels!duel_invites_duel_id_fkey(tcg_type)`)
        .eq('receiver_id', currentUserId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error checking pending invites:', error);
        return;
      }

      if (data && data.sender) {
        console.log('📞 Pending duel invite found:', data);
        const tcg = Array.isArray(data.duel) ? data.duel[0]?.tcg_type : data.duel?.tcg_type;
        setInvite({
          id: data.id,
          sender_id: data.sender_id,
          duel_id: data.duel_id,
          sender: Array.isArray(data.sender) ? data.sender[0] : data.sender,
          duel: { tcg_type: tcg || 'yugioh' },
        });
        playRingtone(tcg || 'yugioh');
      }
    };
    checkPending();

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
          const senderData = Array.isArray(data.sender) ? data.sender[0] : data.sender;
          const tcg = Array.isArray(data.duel) ? data.duel[0]?.tcg_type : data.duel?.tcg_type;
          
          setInvite({
            id: data.id,
            sender_id: data.sender_id,
            duel_id: data.duel_id,
            sender: senderData,
            duel: { tcg_type: tcg || 'yugioh' },
          });
          playRingtone(tcg || 'yugioh');

          // Native notification bridge
          try {
            const nativeBridge = (window as any).DuelVerseNative;
            if (nativeBridge?.showNotification) {
              nativeBridge.showNotification(
                '⚔️ Desafio de Duelo!',
                `${senderData?.username || 'Alguém'} te desafiou para um duelo!`
              );
            }
          } catch (e) {}

          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('⚔️ Desafio de Duelo!', {
              body: `${senderData?.username || 'Alguém'} te desafiou para um duelo!`,
              icon: '/favicon.ico',
              requireInteraction: true,
            });
          }
        }
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel);
      stopAudio();
    };
  }, [currentUserId, playRingtone, stopAudio]);

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
