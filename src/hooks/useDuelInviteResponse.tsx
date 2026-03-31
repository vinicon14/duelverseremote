/**
 * DuelVerse - Hook para feedback de resposta a convite de duelo
 * Desenvolvido por Vinícius
 * 
 * Escuta quando o oponente aceita ou recusa o convite e notifica o desafiante.
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useDuelInviteResponse = (userId: string | undefined) => {
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`duel-invite-response-${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'duel_invites',
        filter: `sender_id=eq.${userId}`,
      }, async (payload) => {
        const newStatus = payload.new.status;
        
        if (newStatus === 'rejected') {
          // Fetch opponent name
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('user_id', payload.new.receiver_id)
            .maybeSingle();

          const opponentName = profile?.username || 'Seu oponente';

          toast({
            title: "❌ Desafio Recusado",
            description: `${opponentName} recusou o seu desafio de duelo.`,
            variant: "destructive",
            duration: 8000,
          });
        } else if (newStatus === 'accepted') {
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('user_id', payload.new.receiver_id)
            .maybeSingle();

          const opponentName = profile?.username || 'Seu oponente';

          toast({
            title: "✅ Desafio Aceito!",
            description: `${opponentName} aceitou o seu desafio!`,
            duration: 5000,
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, toast]);
};
