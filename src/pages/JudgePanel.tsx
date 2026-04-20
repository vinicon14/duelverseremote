/**
 * DuelVerse - Painel de Juíz
 * Desenvolvido por Vinícius
 * 
 * Interface para juizes avaliarem chamadas de jogadores durante duelos.
 * Permite aceitar/rejeitar pedidos de verificação.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

function JudgeTimer({ logId, judgeEnteredAt, onRewardEarned, isRewarded }: { logId: string; judgeEnteredAt: string | null; onRewardEarned: (logId: string) => Promise<boolean>; isRewarded: boolean }) {
  const { t } = useTranslation();
  const getSecondsLeft = useCallback(() => {
    if (!judgeEnteredAt) return REWARD_TIME_SECONDS;
    const elapsed = Math.floor((Date.now() - new Date(judgeEnteredAt).getTime()) / 1000);
    return Math.max(0, REWARD_TIME_SECONDS - elapsed);
  }, [judgeEnteredAt]);

  const [secondsLeft, setSecondsLeft] = useState(getSecondsLeft);
  const [isProcessingReward, setIsProcessingReward] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const initial = getSecondsLeft();
    setSecondsLeft(initial);
    if (initial <= 0) return;

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
  }, [getSecondsLeft]);

  useEffect(() => {
    if (secondsLeft === 0 && !isRewarded && !isProcessingReward) {
      setIsProcessingReward(true);
      void onRewardEarned(logId).finally(() => {
        setIsProcessingReward(false);
      });
    }
  }, [secondsLeft, isRewarded, isProcessingReward, logId, onRewardEarned]);

  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const progress = ((REWARD_TIME_SECONDS - secondsLeft) / REWARD_TIME_SECONDS) * 100;

  if (isRewarded) {
    return (
      <div className="flex items-center gap-2 text-green-500 font-bold text-sm">
        <Coins className="w-4 h-4" />
        {t('judgePanel.rewardEarned')}
      </div>
    );
  }

  if (secondsLeft === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
        <Clock className="w-3 h-3" />
        {isProcessingReward ? t('judgePanel.processingReward') : t('judgePanel.readyToResolve')}
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
  const { t } = useTranslation();
  const { isJudge, loading: judgeLoading } = useJudge();
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTimers, setActiveTimers] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [rewardedLogs, setRewardedLogs] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null));
  }, []);

  useEffect(() => {
    if (!judgeLoading && !isJudge) {
      toast({
        title: t('judgePanel.toast.deniedTitle'),
        description: t('judgePanel.toast.deniedDesc'),
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

  const enterRoom = async (logId: string, matchId: string, playerId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (user.id === playerId) {
        toast({ title: t('judgePanel.toast.selfTitle'), description: t('judgePanel.toast.selfDesc'), variant: "destructive" });
        return;
      }

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

      toast({ title: t('judgePanel.toast.enteringTitle'), description: t('judgePanel.toast.enteringDesc') });
      navigate(`/duel/${matchId}?role=judge`);
    } catch (error: any) {
      toast({ title: t('judgePanel.toast.enterError'), description: error.message, variant: "destructive" });
    }
  };

  const handleRewardEarned = useCallback(async (logId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      await new Promise(resolve => setTimeout(resolve, 3000));

      const { data: rewarded, error } = await supabase.rpc('reward_judge_resolution', {
        p_judge_id: user.id,
        p_log_id: logId
      });

      console.log('Judge reward result:', { rewarded, error, logId });

      if (rewarded) {
        await supabase
          .from('judge_logs')
          .update({ status: 'resolved', resolved_at: new Date().toISOString() })
          .eq('id', logId);

        setRewardedLogs(prev => new Set(prev).add(logId));
        toast({ title: t('judgePanel.toast.rewardTitle'), description: t('judgePanel.toast.rewardDesc') });
        fetchCalls();
        return true;
      } else if (!error) {
        await new Promise(resolve => setTimeout(resolve, 5000));

        const { data: retryResult, error: retryError } = await supabase.rpc('reward_judge_resolution', {
          p_judge_id: user.id,
          p_log_id: logId
        });

        if (retryError) {
          console.error('Judge reward retry error:', retryError);
          return false;
        }

        if (retryResult) {
          await supabase.from('judge_logs').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', logId);
          setRewardedLogs(prev => new Set(prev).add(logId));
          toast({ title: t('judgePanel.toast.rewardTitle'), description: t('judgePanel.toast.rewardDesc') });
          fetchCalls();
          return true;
        }
      }

      return false;
    } catch (error: any) {
      console.error('Reward error:', error);
      return false;
    }
  }, [toast]);

  const resolveCall = async (logId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: rewarded, error: rewardError } = await supabase.rpc('reward_judge_resolution', {
        p_judge_id: user.id,
        p_log_id: logId
      });

      if (rewardError) throw rewardError;

      await supabase
        .from('judge_logs')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', logId);

      if (rewarded) {
        toast({ title: t('judgePanel.toast.resolvedRewardTitle'), description: t('judgePanel.toast.resolvedRewardDesc') });
      } else {
        toast({ title: t('judgePanel.toast.resolvedTitle'), description: t('judgePanel.toast.resolvedDesc') });
      }

      setActiveTimers(prev => { const n = new Set(prev); n.delete(logId); return n; });
      fetchCalls();
    } catch (error: any) {
      toast({ title: t('judgePanel.toast.resolveError'), description: error.message, variant: "destructive" });
    }
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleString('pt-BR');

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      pending: { label: t('judgePanel.status.pending'), className: 'bg-yellow-500' },
      in_room: { label: t('judgePanel.status.inRoom'), className: 'bg-blue-500' },
      resolved: { label: t('judgePanel.status.resolved'), className: 'bg-green-500' }
    };
    const variant = variants[status] || variants.pending;
    return <Badge className={variant.className}>{variant.label}</Badge>;
  };

  if (judgeLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center">{t('judgePanel.loading')}</div>
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
              {t('judgePanel.title')}
            </h1>
            <p className="text-muted-foreground">{t('judgePanel.subtitle')}</p>
          </div>

          <Card className="card-mystic">
            <CardHeader>
              <CardTitle>{t('judgePanel.calls')}</CardTitle>
              <CardDescription>{t('judgePanel.callsDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('judgePanel.th.date')}</TableHead>
                      <TableHead>{t('judgePanel.th.duel')}</TableHead>
                      <TableHead>{t('judgePanel.th.player')}</TableHead>
                      <TableHead>{t('judgePanel.th.status')}</TableHead>
                      <TableHead>{t('judgePanel.th.judge')}</TableHead>
                      <TableHead>{t('judgePanel.th.timer')}</TableHead>
                      <TableHead className="text-right">{t('judgePanel.th.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calls.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          {t('judgePanel.noCalls')}
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
                              <JudgeTimer logId={call.id} judgeEnteredAt={call.judge_entered_at} onRewardEarned={handleRewardEarned} isRewarded={rewardedLogs.has(call.id)} />
                            )}
                            {call.status === 'resolved' && (
                              <span className="text-xs text-green-500">{t('judgePanel.completed')}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            {call.status === 'pending' && (
                              <Button size="sm" onClick={() => enterRoom(call.id, call.match_id, call.player_id)} className="btn-mystic">
                                <Eye className="w-3 h-3 mr-1" />
                                {t('judgePanel.btn.enter')}
                              </Button>
                            )}
                            {call.status === 'in_room' && call.judge_id === currentUserId && (
                              <Button size="sm" onClick={() => resolveCall(call.id)} className="bg-green-600 hover:bg-green-700">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                {t('judgePanel.btn.resolve')}
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
