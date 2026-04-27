/**
 * DuelVerse - Autenticação
 * Desenvolvido por Vinícius
 * 
 * Página de login e cadastro de usuários.
 * Integra com Supabase Auth.
 */
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Swords, Sparkles, Zap } from "lucide-react";
import { detectPlatform } from "@/utils/platformDetection";
import { isInsideDiscord } from "@/utils/discordEmbed";
import { TcgType } from "@/contexts/TcgContext";
import { CountrySelect } from "@/components/CountrySelect";
import { getLanguageForCountry, normalizeBrowserLanguage } from "@/i18n/countries";
import { setAppLanguage } from "@/i18n";
import { SEOHead } from "@/components/SEOHead";

const TCG_OPTIONS: { value: TcgType; label: string; icon: React.ReactNode; color: string; bgGradient: string }[] = [
  { value: 'yugioh', label: 'Yu-Gi-Oh!', icon: <Swords className="w-5 h-5" />, color: 'border-purple-500 bg-purple-500/10', bgGradient: 'from-purple-500/20 via-background to-pink-500/10' },
  { value: 'magic', label: 'Magic: The Gathering', icon: <Sparkles className="w-5 h-5" />, color: 'border-amber-500 bg-amber-500/10', bgGradient: 'from-amber-500/20 via-background to-red-700/10' },
  { value: 'pokemon', label: 'Pokémon TCG', icon: <Zap className="w-5 h-5" />, color: 'border-yellow-500 bg-yellow-500/10', bgGradient: 'from-yellow-500/20 via-background to-blue-500/10' },
];

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [selectedTcg, setSelectedTcg] = useState<TcgType>('yugioh');
  const [signupCountry, setSignupCountry] = useState<string | null>(null);
  const insideDiscord = isInsideDiscord();

  // Pre-detect country via IP for signup convenience
  useEffect(() => {
    if (signupCountry) return;
    fetch('https://ipapi.co/json/', { cache: 'force-cache' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.country_code) setSignupCountry(d.country_code); })
      .catch(() => { /* ignore */ });
  }, [signupCountry]);

  const returnTo = (location.state as any)?.returnTo;

  // Handle Discord OAuth login redirect: ?discord=success&flow=login&token_hash=...&email=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const discordStatus = params.get('discord');
    const flow = params.get('flow');
    const tokenHash = params.get('token_hash');
    const email = params.get('email');

    if (discordStatus === 'success' && flow === 'login' && tokenHash && email) {
      (async () => {
        try {
          setLoading(true);
          const { error } = await supabase.auth.verifyOtp({
            type: 'magiclink',
            token_hash: tokenHash,
            email,
          } as any);
          if (error) throw error;
          // Clean URL params after consuming them
          window.history.replaceState({}, '', window.location.pathname);
          toast({ title: t('auth.loginSuccess'), description: t('auth.welcomeBack') });
          // onAuthStateChange will handle navigation
        } catch (err: any) {
          console.error('[AUTH] Discord login finalize failed:', err);
          toast({
            title: t('auth.loginError'),
            description: err.message || 'Discord login failed',
            variant: 'destructive',
          });
        } finally {
          setLoading(false);
        }
      })();
    } else if (discordStatus === 'error') {
      const message = params.get('message') || 'unknown_error';
      toast({
        title: t('auth.loginError'),
        description: `Discord: ${message}`,
        variant: 'destructive',
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDiscordSignIn = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('discord-oauth-start', {
        body: {
          mode: 'login',
          origin: window.location.origin,
          returnPath: returnTo || '/',
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('Discord URL not returned');
      window.location.href = data.url;
    } catch (err: any) {
      console.error('[AUTH] Discord sign-in error:', err);
      toast({
        title: t('auth.loginError'),
        description: err.message || 'Discord login failed',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  // Verificar se usuário já está logado e redirecionar
  useEffect(() => {
    const defaultRedirect = returnTo || '/';
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          if (event === 'SIGNED_IN') {
            const { data: tcgProfiles } = await supabase
              .from('tcg_profiles')
              .select('id, tcg_type')
              .eq('user_id', session.user.id);
            
            if (!tcgProfiles || tcgProfiles.length === 0) {
              // Auto-create TCG profile from signup metadata
              const metaTcg = session.user.user_metadata?.selected_tcg as TcgType | undefined;
              const tcgToCreate = metaTcg || 'yugioh';
              
              // Get username from profile or metadata
              const { data: mainProfile } = await supabase
                .from('profiles')
                .select('username')
                .eq('user_id', session.user.id)
                .maybeSingle();
              const username = mainProfile?.username || session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'Duelista';

              await supabase.from('tcg_profiles').insert({
                user_id: session.user.id,
                tcg_type: tcgToCreate,
                username,
              });

              // Set active TCG in localStorage
              localStorage.setItem('activeTcg', tcgToCreate);
              navigate(defaultRedirect, { replace: true });
            } else {
              // Restore last active TCG from localStorage, fallback to first profile
              const savedTcg = localStorage.getItem('activeTcg');
              const hasMatchingProfile = tcgProfiles.some(p => p.tcg_type === savedTcg);
              if (!savedTcg || !hasMatchingProfile) {
                localStorage.setItem('activeTcg', tcgProfiles[0].tcg_type);
              }
              navigate(defaultRedirect, { replace: true });
            }
          } else {
            navigate(defaultRedirect, { replace: true });
          }
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        navigate(defaultRedirect, { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`
        }
      });

      if (error) throw error;
    } catch (error: any) {
      console.error('❌ [AUTH] Erro no login com Google:', error);
      toast({
        title: t('auth.loginError'),
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
            title: t('auth.banned'),
            description: t('auth.bannedDesc'),
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
        title: t('auth.loginSuccess'),
        description: t('auth.welcomeBack')
      });

      navigate('/');
    } catch (error: any) {
      toast({
        title: t('auth.loginError'),
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
      toast({ title: t('auth.signupError'), description: t('auth.usernameTooShort'), variant: "destructive" });
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: t('auth.signupError'), description: t('auth.passwordsDontMatch'), variant: "destructive" });
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      toast({ title: t('auth.signupError'), description: t('auth.passwordTooShort'), variant: "destructive" });
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
        toast({ title: t('auth.emailInvalid'), description: t('auth.emailDisposable'), variant: "destructive" });
        setLoading(false);
        return;
      }

      // Verificar formato de email mais rigoroso
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email)) {
        toast({ title: t('auth.emailInvalid'), description: t('auth.emailInvalidDesc'), variant: "destructive" });
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
        toast({ title: t('auth.signupError'), description: t('auth.usernameTaken'), variant: "destructive" });
        setLoading(false);
        return;
      }

      if (!signupCountry) {
        toast({ title: t('auth.needCountry'), description: t('auth.needCountry'), variant: "destructive" });
        setLoading(false);
        return;
      }
      const languageCode = getLanguageForCountry(signupCountry) || normalizeBrowserLanguage(navigator.language);

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          data: {
            username: username.trim(),
            selected_tcg: selectedTcg,
            country_code: signupCountry,
            language_code: languageCode,
          }
        }
      });

      if (error) throw error;

      // Persist language locally for immediate UI
      await setAppLanguage(languageCode as any);

      // Se o usuário já existe (email já cadastrado), o Supabase retorna user mas sem session
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        toast({ title: t('auth.emailInvalid'), description: t('auth.emailAlreadyRegistered'), variant: "destructive" });
        setLoading(false);
        return;
      }

      // Não fazer login automático - aguardar confirmação de email
      toast({ 
        title: t('auth.checkEmail'), 
        description: t('auth.checkEmailDesc', { email }),
      });

    } catch (error: any) {
      const isEmailNotConfirmed = error.message?.toLowerCase().includes('email not confirmed');
      
      if (isEmailNotConfirmed) {
        toast({ title: t('auth.emailNotConfirmed'), description: t('auth.emailNotConfirmedDesc') });
      } else {
        toast({ title: t('auth.signupError'), description: error.message, variant: "destructive" });
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
    <div className="min-h-screen flex items-center justify-center p-4 relative transition-all duration-700">
      <SEOHead tKey="auth" path="/auth" />
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
          0%, 100% { background: linear-gradient(135deg, hsl(270 80% 55% / 0.15) 0%, hsl(315 85% 60% / 0.1) 50%, hsl(var(--background)) 100%); }
          33% { background: linear-gradient(135deg, hsl(45 95% 60% / 0.15) 0%, hsl(15 90% 50% / 0.1) 50%, hsl(var(--background)) 100%); }
          66% { background: linear-gradient(135deg, hsl(50 100% 50% / 0.15) 0%, hsl(210 90% 50% / 0.1) 50%, hsl(var(--background)) 100%); }
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
      <div className={`fixed inset-0 bg-gradient-to-br ${TCG_OPTIONS.find(o => o.value === selectedTcg)?.bgGradient || 'from-primary/10 via-background to-accent/10'} transition-all duration-700 z-0`} />
      <div className="fixed inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iIzgwNTBhMCIgc3Ryb2tlLXdpZHRoPSIuNSIgb3BhY2l0eT0iLjEiLz48L2c+PC9zdmc+')] opacity-20 z-0" />
      
      <Card className="w-full max-w-md card-mystic animate-slide-up relative z-10">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center auth-cycle-bg">
            <Swords className="w-8 h-8 auth-cycle-text" />
          </div>
          <CardTitle className="text-3xl font-bold auth-cycle-text">{t('auth.brandTitle')}</CardTitle>
          <CardDescription className="text-muted-foreground">{t('auth.tagline')}</CardDescription>
        </CardHeader>

        <CardContent>
          {insideDiscord ? (
            // ====== Discord Activity / Embedded mode ======
            <div className="space-y-4">
              <p className="text-sm text-center text-muted-foreground">
                Entre com sua conta Discord para acessar o DuelVerse. Caso seu Discord não tenha conta vinculada, crie uma no site oficial.
              </p>

              <Button
                type="button"
                className="w-full text-white"
                style={{ background: '#5865F2' }}
                onClick={handleDiscordSignIn}
                disabled={loading}
              >
                <svg className="mr-2 h-5 w-5" viewBox="0 0 127.14 96.36" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
                </svg>
                Continuar com Discord
              </Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">ou</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => window.open('https://duelverse.site/auth', '_blank', 'noopener,noreferrer')}
              >
                Criar conta em duelverse.site
              </Button>

              <p className="text-[11px] text-center text-muted-foreground">
                Se seu Discord ainda não está vinculado a uma conta DuelVerse, crie uma e depois faça login aqui pelo Discord.
              </p>
            </div>
          ) : (
            // ====== Normal web mode ======
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="signin">{t('auth.tabSignIn')}</TabsTrigger>
                <TabsTrigger value="signup">{t('auth.tabSignUp')}</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">{t('auth.email')}</Label>
                    <Input id="signin-email" name="signin-email" type="email" placeholder="seu@email.com" required className="bg-background/50" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">{t('auth.password')}</Label>
                    <Input id="signin-password" name="signin-password" type="password" placeholder="••••••••" required className="bg-background/50" />
                  </div>
                  <Button type="submit" className="w-full auth-cycle-btn text-white" disabled={loading}>
                    {loading ? t('auth.signingIn') : t('auth.signInBtn')}
                  </Button>
                </form>

                {!detectPlatform().isNativeApp && (
                  <>
                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">{t('auth.orContinueWith')}</span>
                      </div>
                    </div>

                    <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={loading}>
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      {t('auth.google')}
                    </Button>
                  </>
                )}
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-username">{t('auth.username')}</Label>
                    <Input id="signup-username" name="signup-username" type="text" placeholder={t('auth.username')} required minLength={3} maxLength={20} className="bg-background/50" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">{t('auth.email')}</Label>
                    <Input id="signup-email" name="signup-email" type="email" placeholder="seu@email.com" required className="bg-background/50" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">{t('auth.password')}</Label>
                    <Input id="signup-password" name="signup-password" type="password" placeholder="••••••••" required minLength={6} className="bg-background/50" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm-password">{t('auth.confirmPassword')}</Label>
                    <Input id="signup-confirm-password" name="signup-confirm-password" type="password" placeholder="••••••••" required minLength={6} className="bg-background/50" />
                  </div>

                  {/* Country selection - REQUIRED */}
                  <div className="space-y-2">
                    <Label>{t('auth.country')} *</Label>
                    <CountrySelect
                      value={signupCountry}
                      onChange={setSignupCountry}
                      placeholder={t('auth.countryPlaceholder')}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('auth.countryHelp')}
                    </p>
                  </div>

                  {/* TCG Selection */}
                  <div className="space-y-2">
                    <Label>{t('auth.selectTcg')}</Label>
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

                  <Button type="submit" className="w-full auth-cycle-btn text-white" disabled={loading || !signupCountry}>
                    {loading ? t('auth.signingUp') : t('auth.signUpBtn')}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;

