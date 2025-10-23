import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Coins, Plus, Minus, History, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const AdminDuelCoins = () => {
  const [searchUsername, setSearchUsername] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchRecentTransactions();
  }, []);

  const fetchRecentTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('duelcoins_transactions')
        .select(`
          *,
          sender:sender_id(username),
          receiver:receiver_id(username)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const searchUser = async () => {
    if (!searchUsername.trim()) {
      toast({
        title: "Digite um username",
        variant: "destructive"
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, username, duelcoins_balance, avatar_url')
        .ilike('username', `%${searchUsername}%`)
        .limit(1)
        .single();

      if (error || !data) {
        toast({
          title: "Usuário não encontrado",
          variant: "destructive"
        });
        return;
      }

      setSelectedUser(data);
    } catch (error) {
      console.error('Error searching user:', error);
      toast({
        title: "Erro ao buscar usuário",
        variant: "destructive"
      });
    }
  };

  const manageDuelCoins = async (operation: 'add' | 'remove') => {
    if (!selectedUser) {
      toast({
        title: "Selecione um usuário primeiro",
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
      const { data, error } = await supabase.rpc('admin_manage_duelcoins', {
        p_user_id: selectedUser.user_id,
        p_amount: parseInt(amount),
        p_operation: operation,
        p_reason: reason || 'Ajuste administrativo'
      });

      if (error) throw error;

      const result = data as any;
      if (result.success) {
        toast({
          title: "Sucesso",
          description: result.message
        });
        
        // Atualizar saldo do usuário selecionado
        const newBalance = operation === 'add' 
          ? selectedUser.duelcoins_balance + parseInt(amount)
          : selectedUser.duelcoins_balance - parseInt(amount);
        
        setSelectedUser({ ...selectedUser, duelcoins_balance: newBalance });
        setAmount("");
        setReason("");
        fetchRecentTransactions();
      } else {
        toast({
          title: "Erro",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error managing DuelCoins:', error);
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

  const getTransactionBadge = (type: string) => {
    const badges = {
      'transfer': <Badge variant="outline">Transferência</Badge>,
      'admin_add': <Badge className="bg-green-500">Admin +</Badge>,
      'admin_remove': <Badge className="bg-red-500">Admin -</Badge>,
      'tournament_entry': <Badge variant="secondary">Torneio</Badge>,
      'tournament_prize': <Badge className="bg-yellow-500">Prêmio</Badge>
    };
    return badges[type as keyof typeof badges] || <Badge>{type}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Gerenciamento de DuelCoins</h2>
        <p className="text-muted-foreground">Adicione, remova ou visualize transações de DuelCoins</p>
      </div>

      <Tabs defaultValue="manage" className="space-y-4">
        <TabsList>
          <TabsTrigger value="manage">
            <Coins className="w-4 h-4 mr-2" />
            Gerenciar
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 mr-2" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Buscar Usuário</CardTitle>
              <CardDescription>
                Digite o username para gerenciar DuelCoins
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="search-username">Username</Label>
                  <Input
                    id="search-username"
                    placeholder="Digite o username..."
                    value={searchUsername}
                    onChange={(e) => setSearchUsername(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchUser()}
                  />
                </div>
                <Button onClick={searchUser} className="mt-auto">
                  <Search className="w-4 h-4 mr-2" />
                  Buscar
                </Button>
              </div>

              {selectedUser && (
                <Card className="border-primary/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4 mb-4">
                      <img 
                        src={selectedUser.avatar_url} 
                        alt={selectedUser.username}
                        className="w-16 h-16 rounded-full"
                      />
                      <div>
                        <h3 className="text-xl font-bold">{selectedUser.username}</h3>
                        <p className="text-muted-foreground flex items-center gap-2">
                          <Coins className="w-4 h-4 text-yellow-500" />
                          {selectedUser.duelcoins_balance} DuelCoins
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
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

                      <div>
                        <Label htmlFor="reason">Motivo (opcional)</Label>
                        <Input
                          id="reason"
                          placeholder="Ex: Prêmio de torneio"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={() => manageDuelCoins('add')}
                          disabled={loading}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Adicionar DuelCoins
                        </Button>
                        <Button
                          onClick={() => manageDuelCoins('remove')}
                          disabled={loading}
                          variant="destructive"
                          className="flex-1"
                        >
                          <Minus className="w-4 h-4 mr-2" />
                          Remover DuelCoins
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Transações</CardTitle>
              <CardDescription>
                Últimas 50 transações no sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>De</TableHead>
                      <TableHead>Para</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Descrição</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          Nenhuma transação encontrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-xs">
                            {formatDate(tx.created_at)}
                          </TableCell>
                          <TableCell>
                            {getTransactionBadge(tx.transaction_type)}
                          </TableCell>
                          <TableCell>
                            {tx.sender?.username || '-'}
                          </TableCell>
                          <TableCell>
                            {tx.receiver?.username || '-'}
                          </TableCell>
                          <TableCell className="text-right font-bold text-yellow-500">
                            {tx.amount} <Coins className="w-3 h-3 inline" />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                            {tx.description}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
