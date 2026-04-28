/**
 * DuelVerse - DuelCoins
 * Desenvolvido por Vinícius
 * 
 * Gerenciamento de moeda virtual DuelCoins.
 * Permite transferência entre usuários e visualização de histórico.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { DuelCoinsBalance } from "@/components/DuelCoinsBalance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Coins, Send, History, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useBanCheck } from "@/hooks/useBanCheck";

export default function DuelCoins() {
  useBanCheck();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [receiverUsername, setReceiverUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setCurrentUserId(session.user.id);
    fetchTransactions(session.user.id);
  };

  const fetchTransactions = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('duelcoins_transactions')
        .select('*')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Buscar usernames separadamente
      const transactionsWithUsers = await Promise.all(
        (data || []).map(async (transaction) => {
          let senderUsername = t('duelCoins.origin.system');
          let receiverUsername = t('duelCoins.origin.system');

          if (transaction.sender_id) {
            const { data: senderData } = await supabase
              .from('profiles')
              .select('username')
              .eq('user_id', transaction.sender_id)
              .maybeSingle();
            if (senderData) senderUsername = senderData.username;
          }

          if (transaction.receiver_id) {
            const { data: receiverData } = await supabase
              .from('profiles')
              .select('username')
              .eq('user_id', transaction.receiver_id)
              .maybeSingle();
            if (receiverData) receiverUsername = receiverData.username;
          }

          return {
            ...transaction,
            sender: { username: senderUsername },
            receiver: { username: receiverUsername }
          };
        })
      );

      setTransactions(transactionsWithUsers);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast({
        title: t('myTournaments.errorLoad'),
        variant: "destructive"
      });
    }
  };

  const transferDuelCoins = async () => {
    if (!receiverUsername.trim()) {
      toast({
        title: t('duelCoins.enterUsername'),
        variant: "destructive"
      });
      return;
    }

    if (!amount || parseInt(amount) <= 0) {
      toast({
        title: t('duelCoins.enterAmount'),
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // Buscar ID do destinatário
      const { data: receiver, error: receiverError } = await supabase
        .from('profiles')
        .select('user_id')
        .ilike('username', receiverUsername)
        .single();

      if (receiverError || !receiver) {
        toast({
          title: t('duelCoins.userNotFound'),
          variant: "destructive"
        });
        return;
      }

      // Fazer transferência
      const { data, error } = await supabase.rpc('transfer_duelcoins', {
        p_receiver_id: receiver.user_id,
        p_amount: parseInt(amount)
      });

      if (error) throw error;

      const result = data as any;
      if (result.success) {
        toast({
          title: t('duelCoins.transferDone'),
          description: result.message
        });
        setReceiverUsername("");
        setAmount("");
        fetchTransactions(currentUserId);
      } else {
        toast({
          title: t('duelCoins.transferError'),
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error transferring DuelCoins:', error);
      toast({
        title: t('duelCoins.genericError'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
  };

  const isReceived = (tx: any) => tx.receiver_id === currentUserId;

  const getTransactionOrigin = (tx: any) => {
    const type = tx.transaction_type;
    if (type === 'tournament_entry' || type === 'tournament_prize' || type === 'tournament_win') {
      return t('duelCoins.origin.tournaments');
    }
    if (type === 'admin_add' || type === 'admin_remove' || type === 'system' || type === 'daily_reward' || type === 'purchase' || type === 'redeem' || type === 'subscription' || type === 'judge_reward') {
      return t('duelCoins.origin.system');
    }
    if (type === 'marketplace_purchase') {
      const received = tx.receiver_id === currentUserId;
      return received ? t('duelCoins.origin.marketplaceSale') : t('duelCoins.origin.marketplace');
    }
    if (type === 'transfer') {
      const received = tx.receiver_id === currentUserId;
      return received 
        ? (tx.sender?.username || t('duelCoins.origin.system'))
        : (tx.receiver?.username || t('duelCoins.origin.system'));
    }
    const received = tx.receiver_id === currentUserId;
    return received 
      ? (tx.sender?.username || t('duelCoins.origin.system'))
      : (tx.receiver?.username || t('duelCoins.origin.system'));
  };

  return (
    <div className="min-h-screen bg-transparent">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8 pt-24 pb-24">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold gradient-text flex items-center justify-center gap-2">
              <Coins className="w-10 h-10 text-yellow-500" />
              {t('duelCoins.title')}
            </h1>
            <p className="text-muted-foreground">
              {t('duelCoins.subtitle')}
            </p>
          </div>

          <DuelCoinsBalance />

          <Card className="card-mystic">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                {t('duelCoins.transfer')}
              </CardTitle>
              <CardDescription>
                {t('duelCoins.transferDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="receiver">{t('duelCoins.recipientLabel')}</Label>
                <Input
                  id="receiver"
                  placeholder={t('duelCoins.recipientPlaceholder')}
                  value={receiverUsername}
                  onChange={(e) => setReceiverUsername(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="amount">{t('duelCoins.amountLabel')}</Label>
                <Input
                  id="amount"
                  type="number"
                  min="1"
                  placeholder={t('duelCoins.amountPlaceholder')}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={transferDuelCoins}
                  disabled={loading}
                  className="flex-1 btn-mystic"
                  size="lg"
                >
                  <Send className="w-4 h-4 mr-2" />
                  {loading ? t('duelCoins.sending') : t('duelCoins.send')}
                </Button>
                <div className="flex gap-2">
                  <Button
                    onClick={() => navigate("/buy-duelcoins")}
                    variant="outline"
                    size="lg"
                    className="flex-1 bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20"
                  >
                    <Coins className="w-4 h-4 mr-2 text-yellow-500" />
                    {t('duelCoins.buy')}
                  </Button>
                  <Button
                    onClick={() => navigate("/transfer-history")}
                    variant="outline"
                    size="lg"
                    className="flex-1"
                  >
                    <History className="w-4 h-4 mr-2" />
                    {t('duelCoins.historyBtn')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-mystic">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                {t('duelCoins.history')}
              </CardTitle>
              <CardDescription>
                {t('duelCoins.historyDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('duelCoins.colDate')}</TableHead>
                      <TableHead>{t('duelCoins.colType')}</TableHead>
                      <TableHead>{t('duelCoins.colUser')}</TableHead>
                      <TableHead className="text-right">{t('duelCoins.colAmount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          {t('duelCoins.noTransactions')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactions.map((tx) => {
                        const received = isReceived(tx);
                        return (
                          <TableRow key={tx.id}>
                            <TableCell className="text-xs">
                              {formatDate(tx.created_at)}
                            </TableCell>
                            <TableCell>
                              {received ? (
                                <Badge className="bg-green-500">
                                  <ArrowDownLeft className="w-3 h-3 mr-1" />
                                  {t('duelCoins.received')}
                                </Badge>
                              ) : (
                                <Badge variant="outline">
                                  <ArrowUpRight className="w-3 h-3 mr-1" />
                                  {t('duelCoins.sent')}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {getTransactionOrigin(tx)}
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              <span className={received ? "text-green-500" : "text-muted-foreground"}>
                                {received ? '+' : '-'}{tx.amount}
                              </span>
                              <Coins className="w-3 h-3 inline ml-1 text-yellow-500" />
                            </TableCell>
                          </TableRow>
                        );
                      })
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

