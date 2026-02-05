import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Swords } from "lucide-react";
const Auth = () => {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const [loading, setLoading] = useState(false);

  // Verificar se usuário já está logado e redirecionar
  useEffect(() => {
    // Configurar listener PRIMEIRO
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        // Usuário logado, redirecionar para /duels
        navigate('/duels', {
          replace: true
        });
      }
    });

    // DEPOIS verificar sessão existente
    supabase.auth.getSession().then(({
      data: {
        session
      }
    }) => {
      if (session?.user) {
        navigate('/duels', {
          replace: true
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);
  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      const {
        error
      } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/duels`
        }
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('❌ [AUTH] Erro no login com Google:', error);
      toast({
        title: "Erro no login",
        description: error.message,
        variant: "destructive"
      });
      setLoading(false);
    }
  };
  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("signin-email") as string;
    const password = formData.get("signin-password") as string;
    console.log("🔐 Tentando fazer login com:", email);
    try {
      const {
        data,
        error
      } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      console.log("📝 Resposta do login:", {
        data,
        error
      });
      if (error) {
        console.error("❌ Erro no login:", error);
        throw error;
      }
      console.log("✅ Login bem-sucedido:", data);

      // Verificar se o usuário está banido
      const {
        data: {
          session
        }
      } = await supabase.auth.getSession();
      if (session?.user) {
        const {
          data: profile,
          error: profileError
        } = await supabase.from('profiles').select('is_banned').eq('user_id', session.user.id).maybeSingle();
        if (profileError) {
          console.error("Error checking ban status:", profileError);
        }
        if (profile?.is_banned) {
          // Usuário está banido - deslogar imediatamente
          await supabase.auth.signOut();
          toast({
            title: "❌ Conta suspensa",
            description: "Sua conta foi suspensa. Entre em contato com o suporte para mais informações.",
            variant: "destructive"
          });
          setLoading(false);
          return;
        }

        // Update online status apenas se não estiver banido
        await supabase.from('profiles').update({
          is_online: true,
          last_seen: new Date().toISOString()
        }).eq('user_id', session.user.id);
      }
      toast({
        title: "Login realizado!",
        description: "Bem-vindo de volta, duelista!"
      });
      navigate('/duels');
    } catch (error: any) {
      toast({
        title: "Erro ao fazer login",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("signup-email") as string;
    const username = formData.get("signup-username") as string;
    const password = formData.get("signup-password") as string;
    const confirmPassword = formData.get("signup-confirm-password") as string;
    if (!username || username.trim().length < 3) {
      toast({
        title: "Erro no cadastro",
        description: "O nickname deve ter no mínimo 3 caracteres.",
        variant: "destructive"
      });
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      toast({
        title: "Erro no cadastro",
        description: "As senhas não coincidem.",
        variant: "destructive"
      });
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      toast({
        title: "Erro no cadastro",
        description: "A senha deve ter no mínimo 6 caracteres.",
        variant: "destructive"
      });
      setLoading(false);
      return;
    }
    try {
      // Verificar se o username já existe
      const {
        data: existingUser
      } = await supabase.from('profiles').select('username').eq('username', username.trim()).maybeSingle();
      if (existingUser) {
        toast({
          title: "Erro no cadastro",
          description: "Este nickname já está em uso. Escolha outro.",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }
      const {
        error
      } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/duels`,
          data: {
            username: username.trim()
          }
        }
      });
      if (error) throw error;
      toast({
        title: "Cadastro realizado!",
        description: "Bem-vindo ao Duelverse! Você já pode fazer login."
      });

      // Após o cadastro bem-sucedido, fazer login automaticamente
      const {
        error: signInError
      } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (signInError) throw signInError;
      navigate('/duels');
    } catch (error: any) {
      const errorMessage = error.message?.toLowerCase().includes('email not confirmed') ? "Confirme seu email para continuar" : error.message;
      toast({
        title: "Erro ao criar conta",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  return <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iIzgwNTBhMCIgc3Ryb2tlLXdpZHRoPSIuNSIgb3BhY2l0eT0iLjEiLz48L2c+PC9zdmc+')] opacity-20" />
      
      <Card className="w-full max-w-md card-mystic animate-slide-up relative z-10">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center animate-glow-pulse">
            <Swords className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold text-gradient-mystic">
            DUELVERSE
          </CardTitle>
          <CardDescription className="text-muted-foreground">Entre no mundo dos duelos</CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input id="signin-email" name="signin-email" type="email" placeholder="seu@email.com" required className="bg-background/50" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Senha</Label>
                  <Input id="signin-password" name="signin-password" type="password" placeholder="••••••••" required className="bg-background/50" />
                </div>
                <Button type="submit" className="w-full btn-mystic text-white" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Ou continue com
                  </span>
                </div>
              </div>

              <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={loading}>
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </Button>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-username">Nickname</Label>
                  <Input id="signup-username" name="signup-username" type="text" placeholder="Seu apelido" required minLength={3} maxLength={20} className="bg-background/50" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input id="signup-email" name="signup-email" type="email" placeholder="seu@email.com" required className="bg-background/50" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <Input id="signup-password" name="signup-password" type="password" placeholder="••••••••" required minLength={6} className="bg-background/50" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm-password">Confirmar Senha</Label>
                  <Input id="signup-confirm-password" name="signup-confirm-password" type="password" placeholder="••••••••" required minLength={6} className="bg-background/50" />
                </div>
                <Button type="submit" className="w-full btn-mystic text-white" disabled={loading}>
                  {loading ? "Cadastrando..." : "Criar Conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>;
};
export default Auth;