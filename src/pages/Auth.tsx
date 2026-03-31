/**
 * DuelVerse - Autenticação
 * Desenvolvido por Vinícius
 * 
 * Página de login e cadastro de usuários.
 * Integra com Supabase Auth.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useToast } from "@/hooks/use-toast";
import { Swords, Sparkles, Zap } from "lucide-react";
import { TcgType } from "@/contexts/TcgContext";

const TCG_OPTIONS: { value: TcgType; label: string; icon: React.ReactNode; color: string; bgGradient: string }[] = [
  { value: 'yugioh', label: 'Yu-Gi-Oh!', icon: <Swords className="w-5 h-5" />, color: 'border-purple-500 bg-purple-500/10', bgGradient: 'from-purple-500/20 via-background to-pink-500/10' },
  { value: 'magic', label: 'Magic: The Gathering', icon: <Sparkles className="w-5 h-5" />, color: 'border-amber-500 bg-amber-500/10', bgGradient: 'from-amber-500/20 via-background to-red-700/10' },
  { value: 'pokemon', label: 'Pokémon TCG', icon: <Zap className="w-5 h-5" />, color: 'border-yellow-500 bg-yellow-500/10', bgGradient: 'from-yellow-500/20 via-background to-blue-500/10' },
];

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedTcg, setSelectedTcg] = useState<TcgType>('yugioh');

  // Verificar se usuário já está logado e redirecionar
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          if (event === 'SIGNED_IN') {
            const { data: tcgProfiles } = await supabase
              .from('tcg_profiles')
              .select('id')
              .eq('user_id', session.user.id)
              .limit(1);
            
            if (!tcgProfiles || tcgProfiles.length === 0) {
              navigate('/profile-select', { replace: true });
            } else {
              navigate('/duels', { replace: true });
            }
          } else {
            navigate('/duels', { replace: true });
          }
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        navigate('/duels', { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: `${window.location.origin}/duels`,
        extraParams: {
          prompt: 'select_account',
        }
      });

      if (result.error) throw result.error;
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

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_banned')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (profile?.is_banned) {
          await supabase.auth.signOut();
          toast({
            title: "❌ Conta suspensa",
            description: "Sua conta foi suspensa. Entre em contato com o suporte.",
            variant: "destructive"
          });
          setLoading(false);
          return;
        }

        await supabase
          .from('profiles')
          .update({ is_online: true, last_seen: new Date().toISOString() })
          .eq('user_id', session.user.id);
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
      toast({ title: "Erro no cadastro", description: "O nickname deve ter no mínimo 3 caracteres.", variant: "destructive" });
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: "Erro no cadastro", description: "As senhas não coincidem.", variant: "destructive" });
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      toast({ title: "Erro no cadastro", description: "A senha deve ter no mínimo 6 caracteres.", variant: "destructive" });
      setLoading(false);
      return;
    }

    try {
      // Bloquear domínios de email descartáveis/falsos
      const disposableDomains = [
        'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
        'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
        'dispostable.com', 'trashmail.com', 'fakeinbox.com', 'temp-mail.org',
        'tempail.com', 'tmpmail.net', 'tmpmail.org', 'boun.cr', 'discard.email',
        'discardmail.com', 'discardmail.de', 'emailondeck.com', 'getairmail.com',
        'harakirimail.com', 'mailcatch.com', 'mailnesia.com', 'maildrop.cc',
        'mintemail.com', 'mohmal.com', 'mytemp.email', 'spamgourmet.com',
        'trash-mail.com', '10minutemail.com', 'guerrillamail.info', 'crazymailing.com',
        'tempinbox.com', 'mailforspam.com', 'tempr.email', 'burnermail.io',
        'mailnator.com', 'trashmail.me', 'getnada.com', 'emailfake.com',
        'emailable.rocks', 'mailsac.com', 'inboxkitten.com', 'throwawaymail.com',
      ];

      const emailDomain = email.split('@')[1]?.toLowerCase();
      if (!emailDomain || disposableDomains.includes(emailDomain)) {
        toast({ title: "Email inválido", description: "Emails temporários ou descartáveis não são permitidos. Use um email real.", variant: "destructive" });
        setLoading(false);
        return;
      }

      // Verificar formato de email mais rigoroso
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email)) {
        toast({ title: "Email inválido", description: "Por favor, insira um endereço de email válido.", variant: "destructive" });
        setLoading(false);
        return;
      }

      // Verificar se o nickname já existe
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', username.trim())
        .maybeSingle();

      if (existingUser) {
        toast({ title: "Erro no cadastro", description: "Este nickname já está em uso.", variant: "destructive" });
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          data: { username: username.trim(), selected_tcg: selectedTcg }
        }
      });

      if (error) throw error;

      // Se o usuário já existe (email já cadastrado), o Supabase retorna user mas sem session
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        toast({ title: "Email já cadastrado", description: "Este email já está registrado na plataforma. Tente fazer login.", variant: "destructive" });
        setLoading(false);
        return;
      }

      // Não fazer login automático - aguardar confirmação de email
      toast({ 
        title: "📧 Verifique seu email!", 
        description: "Enviamos um link de confirmação para " + email + ". Clique no link para ativar sua conta.",
      });

    } catch (error: any) {
      const isEmailNotConfirmed = error.message?.toLowerCase().includes('email not confirmed');
      
      if (isEmailNotConfirmed) {
        toast({ title: "📧 Confirme seu email", description: "Verifique sua caixa de entrada e clique no link de confirmação para ativar sua conta." });
      } else {
        toast({ title: "Erro ao criar conta", description: error.message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const tcgColors = {
    yugioh: { primary: '270 80% 55%', accent: '315 85% 60%', glow: '270 80% 65%' },
    magic: { primary: '35 90% 50%', accent: '0 75% 50%', glow: '35 90% 55%' },
    pokemon: { primary: '45 100% 50%', accent: '210 80% 55%', glow: '45 100% 55%' },
  };
  const currentColors = tcgColors[selectedTcg];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden transition-all duration-700">
      <style>{`
        .auth-btn-animate {
          background: linear-gradient(135deg, hsl(${currentColors.primary}), hsl(${currentColors.accent}));
          box-shadow: 0 10px 40px -10px hsl(${currentColors.primary} / 0.5);
          transition: all 0.7s ease;
        }
      .auth-title-animate {
          background-image: linear-gradient(135deg, hsl(${currentColors.primary}), hsl(${currentColors.accent}));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          transition: all 0.7s ease;
        }
        @keyframes auth-bg-cycle {
          0%, 100% { background: linear-gradient(135deg, hsl(270 80% 55% / 0.15) 0%, hsl(315 85% 60% / 0.1) 50%, transparent 100%); }
          33% { background: linear-gradient(135deg, hsl(45 95% 60% / 0.15) 0%, hsl(15 90% 50% / 0.1) 50%, transparent 100%); }
          66% { background: linear-gradient(135deg, hsl(50 100% 50% / 0.15) 0%, hsl(210 90% 50% / 0.1) 50%, transparent 100%); }
        }
        @keyframes auth-text-cycle {
          0%, 100% { color: hsl(270 80% 65%); text-shadow: 0 0 20px hsl(270 80% 55% / 0.5); }
          33% { color: hsl(35 90% 55%); text-shadow: 0 0 20px hsl(35 90% 50% / 0.5); }
          66% { color: hsl(45 100% 55%); text-shadow: 0 0 20px hsl(45 100% 50% / 0.5); }
        }
        @keyframes auth-btn-cycle {
          0%, 100% { background: linear-gradient(135deg, hsl(270 80% 55%), hsl(315 85% 60%)); box-shadow: 0 10px 40px -10px hsl(270 80% 55% / 0.5); }
          33% { background: linear-gradient(135deg, hsl(35 90% 50%), hsl(0 75% 50%)); box-shadow: 0 10px 40px -10px hsl(35 90% 50% / 0.5); }
          66% { background: linear-gradient(135deg, hsl(45 100% 50%), hsl(210 80% 55%)); box-shadow: 0 10px 40px -10px hsl(45 100% 50% / 0.5); }
        }
        .auth-cycle-bg { animation: auth-bg-cycle 9s ease-in-out infinite; }
        .auth-cycle-text { animation: auth-text-cycle 9s ease-in-out infinite; }
        .auth-cycle-btn { animation: auth-btn-cycle 9s ease-in-out infinite; }
      `}</style>
      <div className="fixed inset-0 pointer-events-none z-0 auth-cycle-bg" />
      <div className={`absolute inset-0 bg-gradient-to-br ${TCG_OPTIONS.find(o => o.value === selectedTcg)?.bgGradient || 'from-primary/10 via-background to-accent/10'} transition-all duration-700`} />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iIzgwNTBhMCIgc3Ryb2tlLXdpZHRoPSIuNSIgb3BhY2l0eT0iLjEiLz48L2c+PC9zdmc+')] opacity-20" />
      
      <Card className="w-full max-w-md card-mystic animate-slide-up relative z-10">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center auth-cycle-bg">
            <Swords className="w-8 h-8 auth-cycle-text" />
          </div>
          <CardTitle className="text-3xl font-bold auth-cycle-text">DUELVERSE</CardTitle>
          <CardDescription className="text-muted-foreground">Entre no mundo dos duelos TCG</CardDescription>
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
                <Button type="submit" className="w-full auth-cycle-btn text-white" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Ou continue com</span>
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

                {/* TCG Selection */}
                <div className="space-y-2">
                  <Label>Escolha seu primeiro TCG</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {TCG_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSelectedTcg(opt.value)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${
                          selectedTcg === opt.value
                            ? opt.color + ' border-opacity-100 shadow-md'
                            : 'border-border/50 opacity-60 hover:opacity-80'
                        }`}
                      >
                        {opt.icon}
                        <span className="text-[10px] font-medium leading-tight text-center">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <Button type="submit" className="w-full auth-cycle-btn text-white" disabled={loading}>
                  {loading ? "Cadastrando..." : "Criar Conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
