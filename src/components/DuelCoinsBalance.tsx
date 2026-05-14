/**
 * DuelVerse - Componente de Saldo de DuelCoins
 * Desenvolvido por Vinícius
 * 
 * Exibe o saldo atual de DuelCoins do usuário em tempo real.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Coins } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const DuelCoinsBalance = () => {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBalance();

    // Realtime updates para o saldo
    const channel = supabase
      .channel('duelcoins-balance')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${supabase.auth.getUser().then(r => r.data.user?.id)}`
        },
        (payload) => {
          if (payload.new && 'duelcoins_balance' in payload.new) {
            setBalance((payload.new as any).duelcoins_balance);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchBalance = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('duelcoins_balance')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setBalance(data?.duelcoins_balance || 0);
    } catch (error) {
      console.error('Error fetching balance:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="card-mystic">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Coins className="w-5 h-5 animate-pulse" />
            <span>Carregando...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-mystic border-yellow-400/40 bg-gradient-to-br from-yellow-400/10 to-yellow-500/10">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="w-7 h-7 text-yellow-300 drop-shadow-[0_0_8px_rgba(250,204,21,0.7)]" />
            <div>
              <p className="text-xs text-muted-foreground">Seu Saldo</p>
              <p className="text-2xl font-extrabold bg-gradient-to-br from-yellow-200 via-yellow-300 to-yellow-500 bg-clip-text text-transparent">{balance}</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground text-right font-semibold">
            DuelCoins
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
