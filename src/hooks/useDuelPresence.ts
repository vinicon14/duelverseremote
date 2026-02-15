import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const DISCONNECT_TIMEOUT = 60000; // 60 seconds

export const useDuelPresence = (duelId: string | undefined, userId: string | undefined, isParticipant: boolean) => {
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);
  const isActive = useRef(true);

  const updatePresence = useCallback(async () => {
    if (!duelId || !userId || !isParticipant) return;

    try {
      const { error } = await supabase
        .from('live_duels')
        .update({
          started_at: new Date().toISOString(),
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
      // Check current duel state
      const { data: duel } = await supabase
        .from('live_duels')
        .select('creator_id, opponent_id')
        .eq('id', duelId)
        .single();

      if (!duel) return;

      if (duel.creator_id === userId) {
        // Creator disconnected - delete the room
        await supabase.from('live_duels').delete().eq('id', duelId);
      } else if (duel.opponent_id === userId) {
        // Opponent disconnected - remove from room
        await supabase
          .from('live_duels')
          .update({
            opponent_id: null,
            status: 'waiting',
          })
          .eq('id', duelId);
      }
    } catch (err) {
      console.error('[DuelPresence] Erro ao desconectar:', err);
    }
  }, [duelId, userId, isParticipant]);

  useEffect(() => {
    if (!duelId || !userId || !isParticipant) return;

    isActive.current = true;

    // Initial presence update
    updatePresence();

    // Start heartbeat
    heartbeatInterval.current = setInterval(updatePresence, HEARTBEAT_INTERVAL);

    // Handle page unload/visibility change
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

    // Check for inactive duels every minute
    cleanupInterval.current = setInterval(async () => {
      try {
        const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();

        // Delete duels that have been empty for more than 3 minutes
        // A room is empty when opponent_id is null AND empty_since is set and older than 3 minutes
        const { error } = await supabase
          .from('live_duels')
          .delete()
          .eq('id', duelId)
          .is('opponent_id', null)
          .not('empty_since', 'is', null)
          .lt('empty_since', threeMinutesAgo);

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

// Global cleanup function to be called from Duels list page
export const cleanupAllEmptyDuels = async () => {
  try {
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();

    // Delete all duels that have been empty for more than 3 minutes
    const { error } = await supabase
      .from('live_duels')
      .delete()
      .is('opponent_id', null)
      .not('empty_since', 'is', null)
      .lt('empty_since', threeMinutesAgo);

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
