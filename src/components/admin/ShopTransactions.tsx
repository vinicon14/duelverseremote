import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Copy, Check, Clock, AlertCircle, DollarSign, Coins } from 'lucide-react';

interface CashoutRequest {
  id: string;
  user_id: string;
  amount: number;
  fee_amount: number;
  final_amount: number;
  pix_key: string;
  bank_info: any;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';
  admin_notes: string;
  created_at: string;
  updated_at: string;
  user: {
    username: string;
    email: string;
  };
}

interface AdminCode {
  id: string;
  cashout_id: string;
  code: string;
  used: boolean;
  expires_at: string;
  created_at: string;
}

interface Purchase {
  id: string;
  user_id: string;
  amount: number;
  price: number;
  payment_method: 'pix' | 'credit_card' | 'debit_card';
  pix_code: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  created_at: string;
  user: {
    username: string;
    email: string;
  };
}

export default function ShopTransactions() {
  const [cashouts, setCashouts] = useState<CashoutRequest[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [adminCodes, setAdminCodes] = useState<AdminCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'cashouts' | 'purchases'>('cashouts');
  const [selectedCashout, setSelectedCashout] = useState<CashoutRequest | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'cashouts') {
      fetchCashouts();
    } else {
      fetchPurchases();
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedCashout && selectedCashout.status === 'approved') {
      generateAdminCode(selectedCashout.id);
    }
  }, [selectedCashout]);

  const fetchCashouts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('duelcoins_cashouts')
        .select(`
          *,
          user:profiles(username, email)
        `)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching cashouts:', error);
        throw error;
      }
      setCashouts(data || []);
    } catch (error: any) {
      console.error('Error fetching cashouts:', error);
      
      if (error.code === 'PGRST116') {
        toast({
          title: "Tabela não encontrada",
          description: "Execute os arquivos SQL da pasta database para instalar as tabelas da loja.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Erro ao carregar resgates",
          description: error.message || "Ocorreu um erro ao carregar os resgates.",
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('duelcoins_purchases')
        .select(`
          *,
          user:profiles(username, email)
        `)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching purchases:', error);
        throw error;
      }
      setPurchases(data || []);
    } catch (error: any) {
      console.error('Error fetching purchases:', error);
      
      if (error.code === 'PGRST116') {
        toast({
          title: "Tabela não encontrada",
          description: "Execute os arquivos SQL da pasta database para instalar as tabelas da loja.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Erro ao carregar compras",
          description: error.message || "Ocorreu um erro ao carregar as compras.",
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const generateAdminCode = async (cashoutId: string) => {
    try {
      // Check if code already exists
      const { data: existingCode } = await supabase
        .from('cashout_admin_codes')
        .select('*')
        .eq('cashout_id', cashoutId)
        .single();

      if (existingCode) {
        setAdminCodes(prev => [existingCode, ...prev]);
        return;
      }

      // Generate new code
      const newCode = `DV-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      
      const { data, error } = await supabase
        .from('cashout_admin_codes')
        .insert({
          cashout_id: cashoutId,
          code: newCode,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
        })
        .select()
        .single();

      if (error) throw error;
      
      setAdminCodes(prev => [data, ...prev]);
    } catch (error) {
      toast({
        title: "Erro ao gerar código",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const updateCashoutStatus = async (cashoutId: string, status: string, adminNotes?: string) => {
    try {
      const { error } = await supabase
        .from('duelcoins_cashouts')
        .update({ 
          status,
          admin_notes: adminNotes,
          updated_at: new Date().toISOString()
        })
        .eq('id', cashoutId);

      if (error) throw error;

      // If approving, process the deduction
      if (status === 'approved') {
        const cashout = cashouts.find(c => c.id === cashoutId);
        if (cashout) {
          const { error: processError } = await supabase.rpc('process_duelcoins_cashout', {
            p_user_id: cashout.user_id,
            p_amount: cashout.amount,
            p_fee_amount: cashout.fee_amount
          });

          if (processError) {
            toast({
              title: "Erro ao processar dedução",
              description: processError.message,
              variant: "destructive"
            });
            return;
          }
        }
      }

      toast({
        title: "Status atualizado",
        description: `Resgate atualizado para ${status} com sucesso.`
      });

      fetchCashouts();
    } catch (error) {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const copyToClipboard = async (text: string, type: 'code' | 'pix') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(text);
      setTimeout(() => setCopiedCode(null), 2000);
      
      toast({
        title: "Copiado!",
        description: `${type === 'code' ? 'Código' : 'Código PIX'} copiado para área de transferência.`
      });
    } catch (error) {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar para a área de transferência.",
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-500"><Clock className="w-3 h-3 mr-1" />Pendente</Badge>;
      case 'approved':
        return <Badge className="bg-green-500"><Check className="w-3 h-3 mr-1" />Aprovado</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Rejeitado</Badge>;
      case 'completed':
        return <Badge className="bg-blue-500">Concluído</Badge>;
      case 'cancelled':
        return <Badge variant="outline">Cancelado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Compras e Vendas de DuelCoins</h1>
        <p className="text-muted-foreground">
          Gerencie compras de DuelCoins e solicitações de resgate
        </p>
      </div>

      <div className="flex space-x-4 border-b">
        <button
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'cashouts'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('cashouts')}
        >
          <DollarSign className="w-4 h-4 inline mr-2" />
          Resgates ({cashouts.length})
        </button>
        <button
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'purchases'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('purchases')}
        >
          <Coins className="w-4 h-4 inline mr-2" />
          Compras ({purchases.length})
        </button>
      </div>

      {activeTab === 'cashouts' && (
        <div className="space-y-4">
          {cashouts.map((cashout) => {
            const adminCode = adminCodes.find(code => code.cashout_id === cashout.id);
            
            return (
              <Card key={cashout.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-green-500" />
                        Resgate - {cashout.user.username}
                      </CardTitle>
                      <CardDescription>
                        {cashout.user.email} • {new Date(cashout.created_at).toLocaleString('pt-BR')}
                      </CardDescription>
                    </div>
                    {getStatusBadge(cashout.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Valor Solicitado</Label>
                      <div className="text-lg font-bold text-blue-600">
                        {cashout.amount} DuelCoins
                      </div>
                    </div>
                    <div>
                      <Label>Taxa</Label>
                      <div className="text-lg font-bold text-red-600">
                        {cashout.fee_amount} DuelCoins
                      </div>
                    </div>
                    <div>
                      <Label>Valor Final</Label>
                      <div className="text-lg font-bold text-green-600">
                        R$ {cashout.final_amount.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {cashout.pix_key && (
                    <div>
                      <Label>Chave PIX</Label>
                      <div className="font-mono bg-gray-100 p-2 rounded">{cashout.pix_key}</div>
                    </div>
                  )}

                  {adminCode && (
                    <div className="border-l-4 border-blue-500 pl-4 bg-blue-50 p-3 rounded">
                      <div className="flex justify-between items-center">
                        <div>
                          <Label className="text-blue-700">Código de Administração</Label>
                          <div className="font-mono text-lg font-bold text-blue-900">
                            {adminCode.code}
                          </div>
                          <p className="text-sm text-blue-600">
                            Use este código para identificar o PIX quando fazer o pagamento
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(adminCode.code, 'code')}
                          className="flex items-center gap-2"
                        >
                          {copiedCode === adminCode.code ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                          {copiedCode === adminCode.code ? 'Copiado!' : 'Copiar'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {cashout.admin_notes && (
                    <div>
                      <Label>Notas do Administrador</Label>
                      <div className="bg-gray-100 p-2 rounded">
                        {cashout.admin_notes}
                      </div>
                    </div>
                  )}

                  {cashout.status === 'pending' && (
                    <div className="flex space-x-2">
                      <Button
                        onClick={() => setSelectedCashout(cashout)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Aprovar Resgate
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          const reason = prompt('Motivo da rejeição:');
                          if (reason) {
                            updateCashoutStatus(cashout.id, 'rejected', reason);
                          }
                        }}
                      >
                        <AlertCircle className="w-4 h-4 mr-2" />
                        Rejeitar
                      </Button>
                    </div>
                  )}

                  {cashout.status === 'approved' && !adminCode && (
                    <Button
                      onClick={() => generateAdminCode(cashout.id)}
                      variant="outline"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Gerar Código PIX
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {cashouts.length === 0 && !loading && (
            <Card>
              <CardContent className="text-center py-12">
                <DollarSign className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhuma solicitação de resgate</h3>
                <p className="text-muted-foreground">
                  Os usuários ainda não solicitaram resgates de DuelCoins.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'purchases' && (
        <div className="space-y-4">
          {purchases.map((purchase) => (
            <Card key={purchase.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Coins className="w-5 h-5 text-yellow-500" />
                      Compra - {purchase.user.username}
                    </CardTitle>
                    <CardDescription>
                      {purchase.user.email} • {new Date(purchase.created_at).toLocaleString('pt-BR')}
                    </CardDescription>
                  </div>
                  {getStatusBadge(purchase.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Quantidade de DuelCoins</Label>
                    <div className="text-lg font-bold text-yellow-600">
                      {purchase.amount} DuelCoins
                    </div>
                  </div>
                  <div>
                    <Label>Valor Pago</Label>
                    <div className="text-lg font-bold text-green-600">
                      R$ {purchase.price.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Método de Pagamento</Label>
                  <Badge variant="outline" className="capitalize">
                    {purchase.payment_method.replace('_', ' ')}
                  </Badge>
                </div>

                {purchase.pix_code && (
                  <div>
                    <Label>Código PIX</Label>
                    <div className="flex items-center gap-2">
                      <div className="font-mono bg-gray-100 p-2 rounded flex-1">
                        {purchase.pix_code}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(purchase.pix_code, 'pix')}
                      >
                        {copiedCode === purchase.pix_code ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {purchase.status === 'pending' && (
                  <div className="flex space-x-2">
                    <Button
                      onClick={async () => {
                        try {
                          const { error } = await supabase.rpc('process_duelcoins_purchase', {
                            p_user_id: purchase.user_id,
                            p_amount: purchase.amount,
                            p_payment_id: purchase.id
                          });

                          if (error) throw error;

                          await supabase
                            .from('duelcoins_purchases')
                            .update({ status: 'paid' })
                            .eq('id', purchase.id);

                          toast({
                            title: "Compra confirmada",
                            description: "DuelCoins foram creditados para o usuário."
                          });

                          fetchPurchases();
                        } catch (error) {
                          toast({
                            title: "Erro ao confirmar compra",
                            description: error.message,
                            variant: "destructive"
                          });
                        }
                      }}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Confirmar Pagamento
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {purchases.length === 0 && !loading && (
            <Card>
              <CardContent className="text-center py-12">
                <Coins className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhuma compra encontrada</h3>
                <p className="text-muted-foreground">
                  Os usuários ainda não compraram DuelCoins.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}