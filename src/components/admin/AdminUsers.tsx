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
      
      console.log('👑 INICIANDO ALTERAÇÃO DE CONTA:', {
        userId,
        statusAtual: isCurrentlyPro ? 'PRO' : 'FREE',
        novoStatus: newAccountType.toUpperCase()
      });

      // 1. Verificar o estado atual do usuário
      console.log('🔍 Verificando estado atual...');
      const { data: currentProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id, username, display_name, account_type, user_id')
        .eq('user_id', userId)
        .maybeSingle();
      
      console.log('📋 Perfil atual:', currentProfile);
      
      if (checkError) {
        console.error('❌ Erro ao verificar perfil:', checkError);
        toast({ 
          title: "Erro ao verificar usuário", 
          description: checkError.message,
          variant: "destructive" 
        });
        setActionLoading(null);
        return;
      }

      if (!currentProfile) {
        console.error('❌ Perfil não encontrado!');
        toast({ 
          title: "Erro", 
          description: "Usuário não encontrado no banco de dados",
          variant: "destructive" 
        });
        await fetchUsers();
        setActionLoading(null);
        return;
      }

      console.log(`📝 Tipo de conta atual no banco: ${currentProfile.account_type}`);

      // 2. Atualizar o tipo de conta
      console.log(`🔄 Atualizando account_type de "${currentProfile.account_type}" para "${newAccountType}"...`);
      
      const { data: updateData, error: updateError, count: updateCount } = await supabase
        .from('profiles')
        .update({ account_type: newAccountType })
        .eq('user_id', userId)
        .select('id, username, display_name, account_type');
      
      console.log('📊 Resultado da atualização:', { 
        updateData, 
        updateError, 
        updateCount 
      });
      
      if (updateError) {
        console.error('❌ Erro ao atualizar conta:', updateError);
        toast({ 
          title: "Erro ao atualizar conta", 
          description: updateError.message,
          variant: "destructive" 
        });
        setActionLoading(null);
        return;
      }

      if (!updateData || updateData.length === 0) {
        console.error('❌ Nenhum registro foi atualizado!');
        toast({ 
          title: "Erro na atualização", 
          description: "Nenhum registro foi modificado. Pode ser um problema de permissões RLS.",
          variant: "destructive" 
        });
        await fetchUsers();
        setActionLoading(null);
        return;
      }

      // 3. Verificar se a atualização foi aplicada
      console.log('🔍 Verificando se a atualização foi aplicada...');
      const { data: verifyData, error: verifyError } = await supabase
        .from('profiles')
        .select('account_type, username, display_name')
        .eq('user_id', userId)
        .single();
      
      console.log('✔️ Verificação pós-atualização:', { 
        verifyData, 
        verifyError 
      });
      
      if (verifyError) {
        console.error('❌ Erro ao verificar atualização:', verifyError);
        toast({ 
          title: "Aviso", 
          description: "Conta atualizada, mas houve erro na verificação",
          variant: "default" 
        });
        await fetchUsers();
        setActionLoading(null);
        return;
      }

      if (verifyData?.account_type !== newAccountType) {
        console.error('❌ ERRO: A conta NÃO foi atualizada!', {
          esperado: newAccountType,
          encontrado: verifyData?.account_type
        });
        toast({ 
          title: "Erro na atualização", 
          description: `A conta ainda está como ${verifyData?.account_type.toUpperCase()}. Pode ser um problema de permissões RLS.`,
          variant: "destructive" 
        });
        await fetchUsers();
        setActionLoading(null);
        return;
      }

      // 4. Sucesso!
      console.log('✅ CONTA ATUALIZADA COM SUCESSO!', {
        usuario: verifyData.display_name || verifyData.username,
        antigoTipo: isCurrentlyPro ? 'PRO' : 'FREE',
        novoTipo: newAccountType.toUpperCase()
      });

      // Log da ação
      await logAdminAction(
        userId, 
        'change_account_type', 
        isCurrentlyPro ? 'pro' : 'free', 
        newAccountType
      );
      
      toast({ 
        title: `✅ Conta ${isCurrentlyPro ? 'rebaixada' : 'promovida'}`,
        description: `${verifyData.display_name || verifyData.username} agora é ${newAccountType.toUpperCase()}`
      });
      
      // Atualizar a lista
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

      console.log('🗑️ INICIANDO EXCLUSÃO TOTAL DO USUÁRIO:', userId);

      // 1. Deletar user_roles primeiro (sem dependências)
      console.log('📋 Deletando user_roles...');
      const { error: rolesError, count: rolesCount } = await supabase
        .from('user_roles')
        .delete({ count: 'exact' })
        .eq('user_id', userId);
      
      if (rolesError) {
        console.error('❌ Erro ao deletar user_roles:', rolesError);
      } else {
        console.log(`✅ ${rolesCount || 0} roles deletadas`);
      }

      // 2. Deletar chat_messages
      console.log('💬 Deletando chat_messages...');
      const { error: chatError, count: chatCount } = await supabase
        .from('chat_messages')
        .delete({ count: 'exact' })
        .eq('sender_id', userId);
      
      if (chatError) {
        console.error('❌ Erro ao deletar chat_messages:', chatError);
      } else {
        console.log(`✅ ${chatCount || 0} mensagens deletadas`);
      }

      // 3. Deletar friend_requests
      console.log('👥 Deletando friend_requests...');
      const { error: friendRequestsError, count: friendReqCount } = await supabase
        .from('friend_requests')
        .delete({ count: 'exact' })
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
      
      if (friendRequestsError) {
        console.error('❌ Erro ao deletar friend_requests:', friendRequestsError);
      } else {
        console.log(`✅ ${friendReqCount || 0} friend requests deletados`);
      }

      // 4. Deletar live_duels
      console.log('⚔️ Deletando live_duels...');
      const { error: duelsError, count: duelsCount } = await supabase
        .from('live_duels')
        .delete({ count: 'exact' })
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`);
      
      if (duelsError) {
        console.error('❌ Erro ao deletar live_duels:', duelsError);
      } else {
        console.log(`✅ ${duelsCount || 0} duelos deletados`);
      }

      // 5. Deletar match_history
      console.log('📊 Deletando match_history...');
      const { error: matchHistoryError, count: matchCount } = await supabase
        .from('match_history')
        .delete({ count: 'exact' })
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`);
      
      if (matchHistoryError) {
        console.error('❌ Erro ao deletar match_history:', matchHistoryError);
      } else {
        console.log(`✅ ${matchCount || 0} históricos deletados`);
      }

      // 6. CRITICAL: Deletar o perfil por último
      console.log('👤 Deletando profile do usuário...');
      
      // Primeiro, verificar se o perfil existe
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id, username, display_name, user_id')
        .eq('user_id', userId)
        .maybeSingle();
      
      console.log('🔍 Perfil encontrado antes da exclusão:', existingProfile);
      
      if (checkError) {
        console.error('❌ Erro ao verificar perfil:', checkError);
        toast({ 
          title: "Erro ao verificar usuário", 
          description: checkError.message,
          variant: "destructive" 
        });
        setActionLoading(null);
        return;
      }

      if (!existingProfile) {
        console.log('⚠️ Perfil já não existe no banco de dados!');
        toast({ 
          title: "Usuário já foi excluído", 
          description: "Este perfil não existe mais no banco de dados",
          variant: "default" 
        });
        await fetchUsers();
        setActionLoading(null);
        return;
      }

      // Agora deletar o perfil
      const { error: profileError, data: deletedProfiles, count: profileCount } = await supabase
        .from('profiles')
        .delete({ count: 'exact' })
        .eq('user_id', userId)
        .select();

      console.log('🗑️ Resultado da exclusão do perfil:', { 
        error: profileError, 
        deletedProfiles, 
        count: profileCount 
      });

      if (profileError) {
        console.error('❌ ERRO CRÍTICO ao deletar profile:', profileError);
        toast({ 
          title: "Erro ao deletar usuário", 
          description: `Falha ao excluir o perfil: ${profileError.message}`,
          variant: "destructive" 
        });
        await fetchUsers();
        setActionLoading(null);
        return;
      }

      // Verificar se o perfil foi realmente deletado
      const { data: verifyProfile, error: verifyError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      
      console.log('🔍 Verificação pós-exclusão:', { verifyProfile, verifyError });
      
      if (verifyProfile) {
        console.error('❌ ERRO: O perfil AINDA EXISTE após a exclusão!');
        toast({ 
          title: "Erro na exclusão", 
          description: "O perfil não foi removido do banco de dados. Pode ser um problema de permissões RLS.",
          variant: "destructive" 
        });
        await fetchUsers();
        setActionLoading(null);
        return;
      }

      // Log da ação de exclusão
      await logAdminAction(userId, 'delete_user', 'active', 'deleted');
      
      console.log('✅ USUÁRIO EXCLUÍDO COM SUCESSO:', userId);
      console.log('📝 Perfil deletado:', existingProfile.username);
      
      toast({ 
        title: "✅ Usuário excluído com sucesso",
        description: `${existingProfile.display_name || existingProfile.username} foi removido da plataforma.`
      });
      
      // Atualizar a lista imediatamente
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
