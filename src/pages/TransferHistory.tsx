/**
 * DuelVerse - Histórico de Transferências
 * Desenvolvido por Vinícius
 * 
 * Histórico completo de transações de DuelCoins.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
          let senderUsername = 'Sistema';
          let receiverUsername = 'Sistema';

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
        title: "Erro ao carregar histórico",
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
      return 'Torneios';
    }
    if (type === 'admin_add' || type === 'admin_remove' || type === 'system' || type === 'daily_reward' || type === 'purchase' || type === 'redeem') {
      return 'Sistema';
    }
    if (type === 'transfer') {
      const received = tx.receiver_id === currentUserId;
      return received 
        ? (tx.sender?.username || 'Sistema')
        : (tx.receiver?.username || 'Sistema');
    }
    // Fallback
    const received = tx.receiver_id === currentUserId;
    return received 
      ? (tx.sender?.username || 'Sistema')
      : (tx.receiver?.username || 'Sistema');
  };

  const getTransactionType = (tx: any) => {
    const type = tx.transaction_type;
    switch (type) {
      case 'transfer':
        return 'Transferência';
      case 'tournament_entry':
        return 'Entrada de Torneio';
      case 'tournament_prize':
        return 'Prêmio de Torneio';
      case 'tournament_win':
        return 'Vitória em Torneio';
      case 'admin_add':
        return 'Adição (Admin)';
      case 'admin_remove':
        return 'Remoção (Admin)';
      case 'daily_reward':
        return 'Recompensa Diária';
      case 'purchase':
        return 'Compra';
      case 'redeem':
        return 'Resgate';
      default:
        return type || 'Outro';
    }
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
              Histórico de Transferências
            </h1>
            <p className="text-muted-foreground">
              Visualize todas as suas transações de DuelCoins
            </p>
          </div>

          <Card className="card-mystic">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  Filtros e Busca
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchTransactions(currentUserId)}
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
              </CardTitle>
              <CardDescription>
                Filtre e busque suas transações
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Buscar por usuário ou tipo..."
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
                    Todos
                  </Button>
                  <Button
                    variant={filterType === "sent" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterType("sent")}
                  >
                    Enviados
                  </Button>
                  <Button
                    variant={filterType === "received" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterType("received")}
                  >
                    Recebidos
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-mystic">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="w-5 h-5" />
                Histórico Completo
              </CardTitle>
              <CardDescription>
                {filteredTransactions.length} transações encontradas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Origem/Destino</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          {loading ? "Carregando..." : "Nenhuma transação encontrada"}
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
              Voltar para DuelCoins
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}