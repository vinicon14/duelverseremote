/**
 * DuelVerse - Hook de Presença em Duelo
 * Desenvolvido por Vinícius
 * 
 * Gerencia a presença do usuário em uma sala de duelo.
 * Envia heartbeats para manter a conexão ativa e limpar salas órfãs.
 */
import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

export const useDuelPresence = (duelId: string | undefined, userId: string | undefined, isParticipant: boolean) => {
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);
  const isActive = useRef(true);

  const updatePresence = useCallback(async () => {
    if (!duelId || !userId || !isParticipant) return;

    try {
      // Just touch the duel to signal presence via updated_at or started_at
      const { error } = await supabase
        .from('live_duels')
        .update({
          is_timer_paused: false,
        })
        .eq('id', duelId);

      if (error) {
        console.error('[DuelPresence] Erro ao atualizar presença:', error);
      }
    } catch (err) {
      console.error('[DuelPresence] Erro:', err);
    }
  }, [duelId, userId, isParticipant]);

  const handleDisconnect = useCallback(async () => {
    if (!duelId || !userId || !isParticipant) return;

    try {
      const { data: duel } = await supabase
        .from('live_duels')
        .select('creator_id, opponent_id, status')
        .eq('id', duelId)
        .single();

      if (!duel) return;
      if (duel.status === 'finished') return;

      // Remove opponent or reset duel to waiting
      await supabase
        .from('live_duels')
        .update({
          opponent_id: null,
          status: 'waiting',
        })
        .eq('id', duelId);
    } catch (err) {
      console.error('[DuelPresence] Erro ao desconectar:', err);
    }
  }, [duelId, userId, isParticipant]);

  useEffect(() => {
    if (!duelId || !userId || !isParticipant) return;

    isActive.current = true;
    updatePresence();

    heartbeatInterval.current = setInterval(updatePresence, HEARTBEAT_INTERVAL);

    const handleBeforeUnload = () => {
      handleDisconnect();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updatePresence();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isActive.current = false;
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      handleDisconnect();
    };
  }, [duelId, userId, isParticipant, updatePresence, handleDisconnect]);

  return { updatePresence };
};

export const useDuelCleanup = (duelId: string | undefined) => {
  const cleanupInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!duelId) return;

    cleanupInterval.current = setInterval(async () => {
      try {
        const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();

        // Delete waiting duels with no opponent older than 3 minutes
        const { error } = await supabase
          .from('live_duels')
          .delete()
          .eq('id', duelId)
          .eq('status', 'waiting')
          .is('opponent_id', null)
          .lt('created_at', threeMinutesAgo);

        if (error) {
          console.error('[DuelCleanup] Erro ao limpar duelo:', error);
        }
      } catch (err) {
        console.error('[DuelCleanup] Erro:', err);
      }
    }, 60000);

    return () => {
      if (cleanupInterval.current) {
        clearInterval(cleanupInterval.current);
      }
    };
  }, [duelId]);
};

export const cleanupAllEmptyDuels = async () => {
  try {
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('live_duels')
      .delete()
      .eq('status', 'waiting')
      .is('opponent_id', null)
      .lt('created_at', threeMinutesAgo);

    if (error) {
      console.error('[DuelCleanup] Erro ao limpar duelos:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[DuelCleanup] Erro:', err);
    return false;
  }
};
