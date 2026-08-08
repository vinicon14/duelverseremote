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
  const heartbeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    if (!duelId || !userId || !isParticipant) return;

    updatePresence();

    heartbeatInterval.current = setInterval(updatePresence, HEARTBEAT_INTERVAL);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updatePresence();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [duelId, userId, isParticipant, updatePresence]);

  return { updatePresence };
};

// Salas criadas permanecem abertas indefinidamente, exceto quando finalizadas.
// A limpeza automática foi desativada a pedido do criador da plataforma.
export const useDuelCleanup = (_duelId: string | undefined) => {
  // no-op: salas vazias não são mais removidas automaticamente
};

export const cleanupAllEmptyDuels = async () => {
  // no-op: mantém todas as salas abertas até serem finalizadas manualmente
  return true;
};
