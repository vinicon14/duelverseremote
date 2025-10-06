import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Shield, Ban, Crown, User } from "lucide-react";
import { Input } from "@/components/ui/input";

export const AdminUsers = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching users:', error);
        toast({ title: "Erro ao carregar usuários", variant: "destructive" });
        return;
      }

      if (data) {
        // Buscar roles separadamente para cada usuário
        const usersWithRoles = await Promise.all(
          data.map(async (user) => {
            const { data: rolesData } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', user.user_id);
            
            return {
              ...user,
              user_roles: rolesData || []
            };
          })
        );
        
        setUsers(usersWithRoles);
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: "Erro ao carregar usuários", variant: "destructive" });
    }
  };

  const toggleAdmin = async (userId: string, isCurrentlyAdmin: boolean) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    if (isCurrentlyAdmin) {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', 'admin');
      
      if (error) {
        toast({ title: "Erro ao remover admin", variant: "destructive" });
      } else {
        toast({ title: "Admin removido com sucesso!" });
      }
    } else {
      const { error } = await supabase
        .from('user_roles')
        .insert({ 
          user_id: userId, 
          role: 'admin',
          granted_by: session.user.id
        });
      
      if (error) {
        toast({ title: "Erro ao promover admin", variant: "destructive" });
      } else {
        toast({ title: "Usuário promovido a admin!" });
      }
    }
    
    fetchUsers();
  };

  const togglePro = async (userId: string, isCurrentlyPro: boolean) => {
    const { error } = await supabase
      .from('profiles')
      .update({ account_type: isCurrentlyPro ? 'free' : 'pro' })
      .eq('user_id', userId);
    
    if (error) {
      toast({ title: "Erro ao atualizar conta", variant: "destructive" });
    } else {
      toast({ title: `Conta ${isCurrentlyPro ? 'rebaixada para Free' : 'promovida para PRO'}!` });
    }
    
    fetchUsers();
  };

  const toggleBan = async (userId: string, isCurrentlyBanned: boolean) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_banned: !isCurrentlyBanned })
      .eq('user_id', userId);
    
    if (error) {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
    } else {
      toast({ title: `Usuário ${isCurrentlyBanned ? 'desbanido' : 'banido'}!` });
    }
    
    fetchUsers();
  };

  const filteredUsers = users.filter(user => 
    user.username?.toLowerCase().includes(search.toLowerCase()) ||
    user.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Gerenciar Usuários</h2>
        <Input 
          placeholder="Buscar usuário..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <div className="grid gap-4">
        {filteredUsers.map((user) => {
          const isAdmin = user.user_roles?.some((r: any) => r.role === 'admin');
          const isPro = user.account_type === 'pro';
          const isBanned = user.is_banned;

          return (
            <Card key={user.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <User className="w-5 h-5" />
                      {user.display_name || user.username}
                      {isAdmin && <Badge variant="secondary"><Shield className="w-3 h-3 mr-1" />Admin</Badge>}
                      {isPro && <Badge className="bg-gradient-to-r from-yellow-500 to-amber-500"><Crown className="w-3 h-3 mr-1" />PRO</Badge>}
                      {isBanned && <Badge variant="destructive"><Ban className="w-3 h-3 mr-1" />Banido</Badge>}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      @{user.username} • ELO: {user.elo_rating} • Nível: {user.level}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button
                    variant={isAdmin ? "destructive" : "default"}
                    size="sm"
                    onClick={() => toggleAdmin(user.user_id, isAdmin)}
                  >
                    <Shield className="w-4 h-4 mr-1" />
                    {isAdmin ? 'Remover' : 'Promover'} Admin
                  </Button>
                  <Button
                    variant={isPro ? "outline" : "default"}
                    size="sm"
                    onClick={() => togglePro(user.user_id, isPro)}
                  >
                    <Crown className="w-4 h-4 mr-1" />
                    {isPro ? 'Remover' : 'Promover'} PRO
                  </Button>
                  <Button
                    variant={isBanned ? "outline" : "destructive"}
                    size="sm"
                    onClick={() => toggleBan(user.user_id, isBanned)}
                  >
                    <Ban className="w-4 h-4 mr-1" />
                    {isBanned ? 'Desbanir' : 'Banir'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
