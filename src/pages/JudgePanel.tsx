/**
 * DuelVerse - Painel de Juíz
 * Desenvolvido por Vinícius
 * 
 * Interface para juizes avaliarem chamadas de jogadores durante duelos.
 * Permite aceitar/rejeitar pedidos de verificação.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Scale, Eye, CheckCircle, Clock, Coins } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useJudge } from "@/hooks/useJudge";
import { useBanCheck } from "@/hooks/useBanCheck";

const REWARD_TIME_SECONDS = 120; // 2 minutes

function JudgeTimer({ logId, onRewardEarned }: { logId: string; onRewardEarned: (logId: string) => void }) {
  const [secondsLeft, setSecondsLeft] = useState(REWARD_TIME_SECONDS);
  const [rewarded, setRewarded] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (secondsLeft === 0 && !rewarded) {
      setRewarded(true);
      onRewardEarned(logId);
    }
  }, [secondsLeft, rewarded, logId, onRewardEarned]);

  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const progress = ((REWARD_TIME_SECONDS - secondsLeft) / REWARD_TIME_SECONDS) * 100;

  if (rewarded) {
    return (
      <div className="flex items-center gap-2 text-green-500 font-bold text-sm">
        <Coins className="w-4 h-4" />
        +2 DuelCoins!
      </div>
    );
  }

  return (
    <div className="space-y-1 min-w-[120px]">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="w-3 h-3" />
        <span>{String(minutes).padStart(2, '0')}:{String(secs).padStart(2, '0')}</span>
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  );
}

export default function JudgePanel() {
  useBanCheck();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isJudge, loading: judgeLoading } = useJudge();
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTimers, setActiveTimers] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null));
  }, []);

  useEffect(() => {
    if (!judgeLoading && !isJudge) {
      toast({
        title: "Acesso negado",
        description: "Você não tem permissão de juiz",
        variant: "destructive"
      });
      navigate('/');
      return;
    }

    if (isJudge) {
      fetchCalls();
      
      const channel = supabase
        .channel('judge-calls')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'judge_logs' }, () => fetchCalls())
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [isJudge, judgeLoading, navigate]);

  const fetchCalls = async () => {
    try {
      const { data, error } = await supabase
        .from('judge_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const enrichedData = await Promise.all((data || []).map(async (log) => {
        const [playerData, judgeData, matchData] = await Promise.all([
          supabase.from('profiles').select('username').eq('user_id', log.player_id).single(),
          log.judge_id ? supabase.from('profiles').select('username').eq('user_id', log.judge_id).single() : null,
          supabase.from('live_duels').select('id, status').eq('id', log.match_id).single()
        ]);

        return {
          ...log,
          player: playerData.data,
          judge: judgeData?.data || null,
          match: matchData.data
        };
      }));

      setCalls(enrichedData || []);
    } catch (error: any) {
      console.error('Error fetching calls:', error);
    } finally {
      setLoading(false);
    }
  };

  const enterRoom = async (logId: string, matchId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('judge_logs')
        .update({
          status: 'in_room',
          judge_id: user.id,
          judge_entered_at: new Date().toISOString()
        } as any)
        .eq('id', logId);

      if (error) throw error;

      setActiveTimers(prev => new Set(prev).add(logId));

      toast({ title: "Entrando na sala", description: "Timer de 2 minutos iniciado. Permaneça para ganhar 2 DuelCoins!" });
      navigate(`/duel/${matchId}?role=judge`);
    } catch (error: any) {
      toast({ title: "Erro ao entrar", description: error.message, variant: "destructive" });
    }
  };

  const handleRewardEarned = useCallback(async (logId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: rewarded } = await supabase.rpc('reward_judge_resolution', {
        p_judge_id: user.id,
        p_log_id: logId
      });

      if (rewarded) {
        // Auto-resolve after reward
        await supabase
          .from('judge_logs')
          .update({ status: 'resolved', resolved_at: new Date().toISOString() })
          .eq('id', logId);

        toast({ title: "✅ +2 DuelCoins!", description: "Recompensa recebida por permanecer 2 minutos na chamada" });
        fetchCalls();
      }
    } catch (error: any) {
      console.error('Reward error:', error);
    }
  }, [toast]);

  const resolveCall = async (logId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: rewarded } = await supabase.rpc('reward_judge_resolution', {
        p_judge_id: user.id,
        p_log_id: logId
      });

      await supabase
        .from('judge_logs')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', logId);

      if (rewarded) {
        toast({ title: "✅ Chamada resolvida + 2 DuelCoins!", description: "Recompensa registrada no histórico de transações" });
      } else {
        toast({ title: "Chamada resolvida", description: "Permanência mínima de 2 min não atingida para recompensa" });
      }

      setActiveTimers(prev => { const n = new Set(prev); n.delete(logId); return n; });
      fetchCalls();
    } catch (error: any) {
      toast({ title: "Erro ao resolver", description: error.message, variant: "destructive" });
    }
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleString('pt-BR');

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      pending: { label: 'Pendente', className: 'bg-yellow-500' },
      in_room: { label: 'Na Sala', className: 'bg-blue-500' },
      resolved: { label: 'Resolvido', className: 'bg-green-500' }
    };
    const variant = variants[status] || variants.pending;
    return <Badge className={variant.className}>{variant.label}</Badge>;
  };

  if (judgeLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center">Carregando...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold gradient-text flex items-center justify-center gap-2">
              <Scale className="w-10 h-10 text-purple-500" />
              Painel de Juiz
            </h1>
            <p className="text-muted-foreground">Gerencie chamadas de jogadores durante os duelos</p>
          </div>

          <Card className="card-mystic">
            <CardHeader>
              <CardTitle>Chamadas de Juiz</CardTitle>
              <CardDescription>Todas as solicitações de supervisão</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Duelo</TableHead>
                      <TableHead>Jogador</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Juiz</TableHead>
                      <TableHead>Timer</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calls.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          Nenhuma chamada registrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      calls.map((call) => (
                        <TableRow key={call.id}>
                          <TableCell className="text-xs">{formatDate(call.created_at)}</TableCell>
                          <TableCell className="font-mono text-xs">#{call.match_id.substring(0, 8)}</TableCell>
                          <TableCell>{call.player?.username || 'N/A'}</TableCell>
                          <TableCell>{getStatusBadge(call.status)}</TableCell>
                          <TableCell>{call.judge?.username || '-'}</TableCell>
                          <TableCell>
                            {call.status === 'in_room' && call.judge_id === currentUserId && (
                              <JudgeTimer logId={call.id} onRewardEarned={handleRewardEarned} />
                            )}
                            {call.status === 'resolved' && (
                              <span className="text-xs text-green-500">✅ Concluído</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            {call.status === 'pending' && (
                              <Button size="sm" onClick={() => enterRoom(call.id, call.match_id)} className="btn-mystic">
                                <Eye className="w-3 h-3 mr-1" />
                                Entrar
                              </Button>
                            )}
                            {call.status === 'in_room' && call.judge_id === currentUserId && (
                              <Button size="sm" onClick={() => resolveCall(call.id)} className="bg-green-600 hover:bg-green-700">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Resolver
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
