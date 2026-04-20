/**
 * DuelVerse - Histórico de Transferências
 * Desenvolvido por Vinícius
 * 
 * Histórico completo de transações de DuelCoins.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Coins, ArrowUpRight, ArrowDownLeft, Search, RefreshCw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useBanCheck } from "@/hooks/useBanCheck";

export default function TransferHistory() {
  useBanCheck();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "sent" | "received">("all");

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
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('duelcoins_transactions')
        .select('*')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(100);

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

  const getTransactionType = (tx: any) => {
    const type = tx.transaction_type;
    const key = `duelCoins.type.${type}`;
    const translated = t(key);
    return translated === key ? (type || t('duelCoins.type.other')) : translated;
  };

  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch = searchTerm === "" || 
      getTransactionOrigin(tx).toLowerCase().includes(searchTerm.toLowerCase()) ||
      getTransactionType(tx).toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterType === "all" || 
      (filterType === "sent" && !isReceived(tx)) ||
      (filterType === "received" && isReceived(tx));
    
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold gradient-text flex items-center justify-center gap-2">
              <Coins className="w-10 h-10 text-yellow-500" />
              {t('duelCoins.historyTitle')}
            </h1>
            <p className="text-muted-foreground">
              {t('duelCoins.historySubtitle')}
            </p>
          </div>

          <Card className="card-mystic">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  {t('duelCoins.filtersTitle')}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchTransactions(currentUserId)}
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  {t('weeklyTournaments.refresh')}
                </Button>
              </CardTitle>
              <CardDescription>
                {t('duelCoins.filtersDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Input
                    placeholder={t('duelCoins.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={filterType === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterType("all")}
                  >
                    {t('duelCoins.filterAll')}
                  </Button>
                  <Button
                    variant={filterType === "sent" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterType("sent")}
                  >
                    {t('duelCoins.filterSent')}
                  </Button>
                  <Button
                    variant={filterType === "received" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterType("received")}
                  >
                    {t('duelCoins.filterReceived')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-mystic">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="w-5 h-5" />
                {t('duelCoins.complete')}
              </CardTitle>
              <CardDescription>
                {t('duelCoins.foundCount', { count: filteredTransactions.length })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('duelCoins.colDate')}</TableHead>
                      <TableHead>{t('duelCoins.colType')}</TableHead>
                      <TableHead>{t('duelCoins.colOrigin')}</TableHead>
                      <TableHead className="text-right">{t('duelCoins.colAmount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          {loading ? t('common.loading') : t('duelCoins.noTransactions')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTransactions.map((tx) => {
                        const received = isReceived(tx);
                        return (
                          <TableRow key={tx.id}>
                            <TableCell className="text-xs">
                              {formatDate(tx.created_at)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={received ? "default" : "secondary"}>
                                {getTransactionType(tx)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {received ? (
                                  <ArrowDownLeft className="w-4 h-4 text-green-500" />
                                ) : (
                                  <ArrowUpRight className="w-4 h-4 text-red-500" />
                                )}
                                <span className="font-medium">
                                  {getTransactionOrigin(tx)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              <span className={received ? "text-green-500" : "text-red-500"}>
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

          <div className="text-center">
            <Button
              variant="outline"
              onClick={() => navigate("/duelcoins")}
              className="btn-mystic"
            >
              {t('duelCoins.backToCoins')}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}