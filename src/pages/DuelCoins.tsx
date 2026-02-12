import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
      console.log('[DuelCoins] Buscando transações para usuário:', userId);
      
      // Tentar usar a função RPC primeiro (mais confiável - bypass RLS)
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_user_transactions', { 
          p_limit: 100,  // Aumentado para 100
          p_offset: 0 
        });

      if (rpcError) {
        console.error('[DuelCoins] Erro na RPC:', rpcError);
        throw rpcError;
      }

      if (rpcData && rpcData.length > 0) {
        console.log(`[DuelCoins] ${rpcData.length} transações encontradas via RPC`);
        
        // Formatar dados da RPC
        const formattedTransactions = rpcData.map((tx: any) => ({
          ...tx,
          sender: { username: tx.sender_username || 'Sistema' },
          receiver: { username: tx.receiver_username || 'Sistema' }
        }));
        setTransactions(formattedTransactions);
        return;
      }

      console.warn('[DuelCoins] Nenhuma transação encontrada via RPC');
      setTransactions([]);
      
    } catch (error: any) {
      console.error('[DuelCoins] Erro ao buscar transações:', error);
      toast({
        title: "Erro ao carregar histórico",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive"
      });
      setTransactions([]);
    }
  };
    } catch (error: any) {
      console.error('Error fetching transactions:', error);
      toast({
        title: "Erro ao carregar histórico",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive"
      });
    }
  };

  const transferDuelCoins = async () => {
    if (!receiverUsername.trim()) {
      toast({
        title: "Digite um username",
        variant: "destructive"
      });
      return;
    }

    if (!amount || parseInt(amount) <= 0) {
      toast({
        title: "Digite uma quantidade válida",
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
          title: "Usuário não encontrado",
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
          title: "Transferência realizada!",
          description: result.message
        });
        setReceiverUsername("");
        setAmount("");
        fetchTransactions(currentUserId);
      } else {
        toast({
          title: "Erro na transferência",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error transferring DuelCoins:', error);
      toast({
        title: "Erro",
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold gradient-text flex items-center justify-center gap-2">
              <Coins className="w-10 h-10 text-yellow-500" />
              DuelCoins
            </h1>
            <p className="text-muted-foreground">
              Gerencie sua moeda virtual do DuelVerse
            </p>
          </div>

          <DuelCoinsBalance />

          <Card className="card-mystic">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                Transferir DuelCoins
              </CardTitle>
              <CardDescription>
                Envie DuelCoins para outros jogadores
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="receiver">Username do destinatário</Label>
                <Input
                  id="receiver"
                  placeholder="Digite o username..."
                  value={receiverUsername}
                  onChange={(e) => setReceiverUsername(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="amount">Quantidade</Label>
                <Input
                  id="amount"
                  type="number"
                  min="1"
                  placeholder="Ex: 100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <Button
                onClick={transferDuelCoins}
                disabled={loading}
                className="w-full btn-mystic"
                size="lg"
              >
                <Send className="w-4 h-4 mr-2" />
                {loading ? "Transferindo..." : "Enviar DuelCoins"}
              </Button>
            </CardContent>
          </Card>

          <Card className="card-mystic">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Histórico de Transações
              </CardTitle>
              <CardDescription>
                Suas últimas 20 transações
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          Nenhuma transação encontrada
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
                                  Recebido
                                </Badge>
                              ) : (
                                <Badge variant="outline">
                                  <ArrowUpRight className="w-3 h-3 mr-1" />
                                  Enviado
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
