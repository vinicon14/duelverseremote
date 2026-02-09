import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Key, Copy, Trash2, RefreshCw, Crown, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface ProToken {
  id: string;
  token: string;
  email: string;
  user_id: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
  profiles: {
    username: string;
    email?: string;
  } | null;
}

export const AdminProTokens = () => {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<ProToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTokenEmail, setNewTokenEmail] = useState('');
  const [newTokenUserId, setNewTokenUserId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    try {
      const { data, error } = await supabase
        .from('pro_tokens')
        .select(`
          *,
          profiles:user_id(username, email)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTokens(data || []);
    } catch (error) {
      console.error('Error fetching tokens:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os tokens',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const generateToken = () => {
    // Generate a random token: XXXXX-XXXXX-XXXXX format
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segments = 3;
    const segmentLength = 5;
    let token = '';
    
    for (let i = 0; i < segments; i++) {
      if (i > 0) token += '-';
      for (let j = 0; j < segmentLength; j++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }
    
    return token;
  };

  const handleGenerateToken = async () => {
    if (!newTokenEmail || !newTokenUserId) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha o email e o ID do usuário',
        variant: 'destructive'
      });
      return;
    }

    setGenerating(true);

    try {
      const token = generateToken();
      
      const { error } = await supabase
        .from('pro_tokens')
        .insert({
          token: token,
          email: newTokenEmail.toLowerCase().trim(),
          user_id: newTokenUserId,
          is_active: true
        });

      if (error) throw error;

      setGeneratedToken(token);
      setNewTokenEmail('');
      setNewTokenUserId('');
      fetchTokens();
      
      toast({
        title: 'Token gerado!',
        description: 'Copie o token e envie ao usuário',
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao gerar token',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast({
      title: 'Copiado!',
      description: 'Token copiado para a área de transferência',
    });
  };

  const handleRevokeToken = async (tokenId: string) => {
    try {
      const { error } = await supabase
        .from('pro_tokens')
        .update({ is_active: false })
        .eq('id', tokenId);

      if (error) throw error;

      fetchTokens();
      toast({
        title: 'Token revogado',
        description: 'O token foi desativado com sucesso',
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível revogar o token',
        variant: 'destructive'
      });
    }
  };

  const handleReactivateToken = async (tokenId: string) => {
    try {
      const { error } = await supabase
        .from('pro_tokens')
        .update({ is_active: true })
        .eq('id', tokenId);

      if (error) throw error;

      fetchTokens();
      toast({
        title: 'Token reativado',
        description: 'O token foi reativado com sucesso',
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível reativar o token',
        variant: 'destructive'
      });
    }
  };

  const filteredTokens = tokens.filter(token => 
    token.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    token.token.toLowerCase().includes(searchQuery.toLowerCase()) ||
    token.profiles?.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('pt-BR');
  };

  return (
    <div className="space-y-6">
      {/* Generate Token Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-yellow-500" />
            Gerar Novo Token PRO
          </CardTitle>
          <CardDescription>
            Crie um token de acesso exclusivo para usuários PRO
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email do Usuário</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@email.com"
                value={newTokenEmail}
                onChange={(e) => setNewTokenEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="userId">ID do Usuário (UUID)</Label>
              <Input
                id="userId"
                placeholder="00000000-0000-0000-0000-000000000000"
                value={newTokenUserId}
                onChange={(e) => setNewTokenUserId(e.target.value)}
              />
            </div>
          </div>

          <Button 
            onClick={handleGenerateToken}
            disabled={generating}
            className="w-full md:w-auto"
          >
            {generating ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Key className="w-4 h-4 mr-2" />
            )}
            Gerar Token
          </Button>

          {generatedToken && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <Label className="text-yellow-800">Token Gerado (copie e envie ao usuário):</Label>
              <div className="flex items-center gap-2 mt-2">
                <code className="flex-1 p-2 bg-white border rounded font-mono text-lg">
                  {generatedToken}
                </code>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => handleCopyToken(generatedToken)}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-sm text-yellow-600 mt-2">
                Este token só será exibido uma vez. Certifique-se de copiá-lo!
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tokens List */}
      <Card>
        <CardHeader>
          <CardTitle>Tokens PRO Ativos</CardTitle>
          <CardDescription>
            Gerencie os tokens de acesso PRO existentes
          </CardDescription>
          <div className="mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por email, token ou usuário..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : filteredTokens.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum token encontrado
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Token</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead>Último uso</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTokens.map((token) => (
                    <TableRow key={token.id}>
                      <TableCell>
                        <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
                          {token.token}
                        </code>
                      </TableCell>
                      <TableCell>{token.email}</TableCell>
                      <TableCell>
                        {token.profiles?.username || '-'}
                      </TableCell>
                      <TableCell>{formatDate(token.created_at)}</TableCell>
                      <TableCell>{formatDate(token.last_used_at)}</TableCell>
                      <TableCell>
                        {token.is_active ? (
                          <Badge className="bg-green-500">Ativo</Badge>
                        ) : (
                          <Badge variant="destructive">Revogado</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleCopyToken(token.token)}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          {token.is_active ? (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="icon"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Revogar Token</DialogTitle>
                                  <DialogDescription>
                                    Tem certeza que deseja revogar este token? 
                                    O usuário não poderá mais fazer login com ele.
                                  </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                  <Button
                                    variant="destructive"
                                    onClick={() => handleRevokeToken(token.id)}
                                  >
                                    Revogar
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          ) : (
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleReactivateToken(token.id)}
                            >
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
