import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Shield, Ban, Crown, User, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

export const AdminUsers = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
    
    // Listener de tempo real para mudanças em user_roles e profiles
    const rolesChannel = supabase
      .channel('admin_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_roles' },
        () => fetchUsers()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => fetchUsers()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(rolesChannel);
    };
  }, []);

  const logAdminAction = async (targetUserId: string, actionType: string, oldValue: string, newValue: string) => {
    // Log para console por enquanto - a tabela admin_action_logs será criada posteriormente
    console.log('Admin Action:', {
      targetUserId,
      actionType,
      oldValue,
      newValue,
      timestamp: new Date().toISOString()
    });
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching users:', error);
        toast({ 
          title: "Erro ao carregar usuários", 
          description: error.message,
          variant: "destructive" 
        });
        return;
      }

      if (data) {
        // Buscar roles separadamente para cada usuário
        const usersWithRoles = await Promise.all(
          data.map(async (user) => {
            const { data: rolesData, error: rolesError } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', user.user_id);
            
            if (rolesError) {
              console.error('Error fetching roles for user:', user.user_id, rolesError);
            }
            
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
      toast({ 
        title: "Erro ao carregar usuários", 
        description: "Ocorreu um erro inesperado",
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleAdmin = async (userId: string, isCurrentlyAdmin: boolean) => {
    setActionLoading(`admin-${userId}`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Sessão expirada", description: "Faça login novamente", variant: "destructive" });
        return;
      }

      if (isCurrentlyAdmin) {
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', 'admin');
        
        if (error) {
          console.error('Error removing admin:', error);
          toast({ 
            title: "Erro ao remover admin", 
            description: error.message,
            variant: "destructive" 
          });
        } else {
          await logAdminAction(userId, 'remove_admin', 'admin', 'user');
          toast({ 
            title: "✅ Admin removido", 
            description: "Permissões atualizadas com sucesso" 
          });
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
          console.error('Error promoting admin:', error);
          toast({ 
            title: "Erro ao promover admin", 
            description: error.message,
            variant: "destructive" 
          });
        } else {
          await logAdminAction(userId, 'promote_admin', 'user', 'admin');
          toast({ 
            title: "✅ Usuário promovido", 
            description: "Agora tem permissões de administrador" 
          });
        }
      }
      
      await fetchUsers();
    } finally {
      setActionLoading(null);
    }
  };

  const togglePro = async (userId: string, isCurrentlyPro: boolean) => {
    setActionLoading(`pro-${userId}`);
    try {
      const newAccountType = isCurrentlyPro ? 'free' : 'pro';
      
      console.log('👑 Chamando Edge Function para alterar conta...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Erro", description: "Sessão expirada", variant: "destructive" });
        setActionLoading(null);
        return;
      }

      const response = await supabase.functions.invoke('admin-toggle-pro', {
        body: { userId, accountType: newAccountType }
      });

      console.log('📥 Resposta da Edge Function:', response);

      if (response.error) {
        console.error('❌ Erro na Edge Function:', response.error);
        toast({
          title: "Erro ao atualizar conta",
          description: response.error.message || "Falha ao comunicar com o servidor",
          variant: "destructive"
        });
        setActionLoading(null);
        return;
      }

      if (!response.data?.success) {
        console.error('❌ Edge Function retornou erro:', response.data);
        toast({
          title: "Erro ao atualizar conta",
          description: response.data?.error || "Erro desconhecido",
          variant: "destructive"
        });
        setActionLoading(null);
        return;
      }

      console.log('✅ Conta atualizada com sucesso:', response.data);

      await logAdminAction(userId, 'change_account_type', isCurrentlyPro ? 'pro' : 'free', newAccountType);

      toast({
        title: `✅ Conta ${isCurrentlyPro ? 'rebaixada' : 'promovida'}`,
        description: `Usuário agora é ${newAccountType.toUpperCase()}`
      });

      await fetchUsers();

    } catch (error: any) {
      console.error('❌ ERRO INESPERADO:', error);
      toast({
        title: "Erro ao atualizar conta",
        description: error.message || "Ocorreu um erro inesperado",
        variant: "destructive"
      });
    } finally {
      setActionLoading(null);
    }
  };

  const deleteUser = async (userId: string) => {
    setActionLoading(`ban-${userId}`);
    try {
      // Verificar se não está tentando deletar a si mesmo
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser?.id === userId) {
        toast({
          title: "Erro",
          description: "Você não pode deletar sua própria conta",
          variant: "destructive"
        });
        setActionLoading(null);
        return;
      }

      console.log('🗑️ Chamando Edge Function para deletar usuário...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Erro", description: "Sessão expirada", variant: "destructive" });
        setActionLoading(null);
        return;
      }

      const response = await supabase.functions.invoke('admin-delete-user', {
        body: { userId }
      });

      console.log('📥 Resposta da Edge Function:', response);

      if (response.error) {
        console.error('❌ Erro na Edge Function:', response.error);
        toast({
          title: "Erro ao deletar usuário",
          description: response.error.message || "Falha ao comunicar com o servidor",
          variant: "destructive"
        });
        setActionLoading(null);
        return;
      }

      if (!response.data?.success) {
        console.error('❌ Edge Function retornou erro:', response.data);
        toast({
          title: "Erro ao deletar usuário",
          description: response.data?.error || "Erro desconhecido",
          variant: "destructive"
        });
        setActionLoading(null);
        return;
      }

      console.log('✅ Usuário deletado com sucesso:', response.data);

      await logAdminAction(userId, 'delete_user', 'active', 'deleted');

      toast({
        title: "✅ Usuário excluído com sucesso",
        description: 'Todos os dados do usuário foram removidos da plataforma.'
      });

      await fetchUsers();

    } catch (error: any) {
      console.error('❌ ERRO INESPERADO:', error);
      toast({
        title: "Erro ao deletar usuário",
        description: error.message || "Ocorreu um erro inesperado durante a exclusão",
        variant: "destructive"
      });
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = users.filter(user => 
    user.username?.toLowerCase().includes(search.toLowerCase()) ||
    user.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Carregando usuários...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Gerenciar Usuários</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Total: {users.length} usuários • Exibindo: {filteredUsers.length}
          </p>
        </div>
        <Input 
          placeholder="Buscar usuário..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {filteredUsers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <User className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhum usuário encontrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredUsers.map((user) => {
            const isAdmin = user.user_roles?.some((r: any) => r.role === 'admin');
            const isPro = user.account_type === 'pro';

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
                      disabled={actionLoading === `admin-${user.user_id}`}
                    >
                      {actionLoading === `admin-${user.user_id}` ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Shield className="w-4 h-4 mr-1" />
                      )}
                      {isAdmin ? 'Remover' : 'Promover'} Admin
                    </Button>
                    <Button
                      variant={isPro ? "outline" : "default"}
                      size="sm"
                      onClick={() => togglePro(user.user_id, isPro)}
                      disabled={actionLoading === `pro-${user.user_id}`}
                    >
                      {actionLoading === `pro-${user.user_id}` ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Crown className="w-4 h-4 mr-1" />
                      )}
                      {isPro ? 'Remover' : 'Promover'} PRO
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (window.confirm('⚠️ ATENÇÃO: Isso irá excluir PERMANENTEMENTE o usuário e TODOS os seus dados. Esta ação não pode ser desfeita. Deseja continuar?')) {
                          deleteUser(user.user_id);
                        }
                      }}
                      disabled={actionLoading === `ban-${user.user_id}`}
                    >
                      {actionLoading === `ban-${user.user_id}` ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Ban className="w-4 h-4 mr-1" />
                      )}
                      Excluir Usuário
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
