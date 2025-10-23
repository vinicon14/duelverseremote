import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Scale, Search, UserMinus, UserPlus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const AdminJudges = () => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [judges, setJudges] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchJudges();
  }, []);

  const fetchJudges = async () => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          user_id,
          profiles:user_id(username, avatar_url)
        `)
        .eq('role', 'judge');

      if (error) throw error;
      setJudges(data || []);
    } catch (error: any) {
      console.error('Error fetching judges:', error);
    }
  };

  const searchUsers = async () => {
    if (!searchTerm.trim()) {
      toast({
        title: "Digite um username",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('search_users', {
        search_term: searchTerm,
        limit_count: 10
      });

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao buscar usuários",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const promoteToJudge = async (userId: string, username: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role: 'judge'
        });

      if (error) throw error;

      toast({
        title: "Juiz promovido!",
        description: `${username} agora é um juiz`
      });

      fetchJudges();
      setSearchResults([]);
      setSearchTerm("");
    } catch (error: any) {
      toast({
        title: "Erro ao promover",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const removeJudge = async (userId: string, username: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', 'judge');

      if (error) throw error;

      toast({
        title: "Juiz removido",
        description: `${username} não é mais um juiz`
      });

      fetchJudges();
    } catch (error: any) {
      toast({
        title: "Erro ao remover",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="card-mystic">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5" />
            Gerenciar Juízes
          </CardTitle>
          <CardDescription>
            Promova usuários para a função de juiz
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="search-judge">Buscar usuário</Label>
              <Input
                id="search-judge"
                placeholder="Digite o username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
              />
            </div>
            <Button
              onClick={searchUsers}
              disabled={loading}
              className="mt-auto btn-mystic"
            >
              <Search className="w-4 h-4 mr-2" />
              Buscar
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Pontos</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchResults.map((user) => (
                    <TableRow key={user.user_id}>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>{user.points}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => promoteToJudge(user.user_id, user.username)}
                          disabled={loading}
                          className="btn-mystic"
                        >
                          <UserPlus className="w-3 h-3 mr-1" />
                          Promover
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="card-mystic">
        <CardHeader>
          <CardTitle>Juízes Ativos</CardTitle>
          <CardDescription>
            Usuários com permissões de juiz
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {judges.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Nenhum juiz cadastrado
                    </TableCell>
                  </TableRow>
                ) : (
                  judges.map((judge) => (
                    <TableRow key={judge.user_id}>
                      <TableCell className="font-medium">
                        {judge.profiles?.username || 'Usuário desconhecido'}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-purple-500">
                          <Scale className="w-3 h-3 mr-1" />
                          Juiz
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => removeJudge(judge.user_id, judge.profiles?.username)}
                          disabled={loading}
                        >
                          <UserMinus className="w-3 h-3 mr-1" />
                          Remover
                        </Button>
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
  );
};
