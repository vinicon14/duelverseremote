import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Smartphone, Check, Bell, LogIn, Monitor, Apple, Chrome } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { detectPlatform } from "@/utils/platformDetection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function InstallApp() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { isSupported, hasPermission, requestPermission } = useBrowserNotifications();
  const { toast } = useToast();
  const platform = detectPlatform();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
      setLoading(false);
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      subscription.unsubscribe();
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      toast({ title: "Instalação não disponível", description: "Use as instruções abaixo para instalar manualmente", variant: "destructive" });
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
      toast({ title: "App instalado!", description: "O Duelverse foi instalado com sucesso" });
    }
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  const handleEnableNotifications = async () => {
    const success = await requestPermission();
    if (success) {
      toast({ title: "Notificações ativadas!", description: "Você receberá notificações enquanto o app estiver aberto" });
    }
  };

  const defaultTab = platform.isAndroid ? "android" : platform.isIOS ? "ios" : "windows";

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold text-gradient-mystic">
            📥 Baixar Duelverse
          </h1>
          <p className="text-muted-foreground">
            Instale o app na sua plataforma favorita
          </p>
        </div>

        {/* Quick Install (if browser supports it) */}
        {isInstalled ? (
          <Card className="border-primary/30">
            <CardContent className="flex items-center gap-3 p-6">
              <Check className="h-6 w-6 text-primary shrink-0" />
              <span className="text-lg font-medium">App já instalado neste dispositivo!</span>
            </CardContent>
          </Card>
        ) : isInstallable ? (
          <Card className="border-primary/30">
            <CardContent className="p-6">
              <Button onClick={handleInstall} className="w-full btn-mystic text-white" size="lg">
                <Download className="mr-2 h-5 w-5" />
                Instalar Agora
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {/* Platform Tabs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Instruções por Plataforma
            </CardTitle>
            <CardDescription>Escolha seu sistema operacional</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={defaultTab}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="android">Android</TabsTrigger>
                <TabsTrigger value="ios">iOS</TabsTrigger>
                <TabsTrigger value="windows">Windows</TabsTrigger>
                <TabsTrigger value="linux">Linux</TabsTrigger>
              </TabsList>

              <TabsContent value="android" className="mt-4 space-y-3">
                <h3 className="font-semibold text-lg">📱 Android (Chrome)</h3>
                <ol className="space-y-3 text-sm">
                  <Step n={1}>Abra o <strong>Duelverse</strong> no <strong>Google Chrome</strong></Step>
                  <Step n={2}>Toque no menu <strong>⋮</strong> (três pontos) no canto superior direito</Step>
                  <Step n={3}>Selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong></Step>
                  <Step n={4}>Confirme tocando em <strong>"Instalar"</strong></Step>
                  <Step n={5}>O app aparecerá na sua tela inicial como um app nativo!</Step>
                </ol>
              </TabsContent>

              <TabsContent value="ios" className="mt-4 space-y-3">
                <h3 className="font-semibold text-lg">🍎 iPhone / iPad (Safari)</h3>
                <ol className="space-y-3 text-sm">
                  <Step n={1}>Abra o <strong>Duelverse</strong> no <strong>Safari</strong> (obrigatório)</Step>
                  <Step n={2}>Toque no botão <strong>Compartilhar</strong> 📤 (quadrado com seta para cima)</Step>
                  <Step n={3}>Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong></Step>
                  <Step n={4}>Confirme tocando em <strong>"Adicionar"</strong></Step>
                  <Step n={5}>O app aparecerá na sua tela inicial com ícone próprio!</Step>
                </ol>
                <div className="p-3 bg-muted rounded-lg text-xs text-muted-foreground">
                  ⚠️ No iOS, é necessário usar o Safari. Chrome e outros navegadores não suportam instalação de PWA no iPhone.
                </div>
              </TabsContent>

              <TabsContent value="windows" className="mt-4 space-y-3">
                <h3 className="font-semibold text-lg">🖥️ Windows (Chrome / Edge)</h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Via Google Chrome:</h4>
                    <ol className="space-y-3 text-sm">
                      <Step n={1}>Abra o <strong>Duelverse</strong> no Google Chrome</Step>
                      <Step n={2}>Clique no ícone de <strong>instalação</strong> 📥 na barra de endereço (lado direito)</Step>
                      <Step n={3}>Ou clique em <strong>⋮ → "Instalar Duelverse..."</strong></Step>
                      <Step n={4}>Confirme clicando em <strong>"Instalar"</strong></Step>
                    </ol>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Via Microsoft Edge:</h4>
                    <ol className="space-y-3 text-sm">
                      <Step n={1}>Abra o <strong>Duelverse</strong> no Microsoft Edge</Step>
                      <Step n={2}>Clique em <strong>⋯ → "Aplicativos" → "Instalar este site como um aplicativo"</strong></Step>
                      <Step n={3}>Confirme clicando em <strong>"Instalar"</strong></Step>
                    </ol>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="linux" className="mt-4 space-y-3">
                <h3 className="font-semibold text-lg">🐧 Linux (Chrome / Chromium)</h3>
                <ol className="space-y-3 text-sm">
                  <Step n={1}>Abra o <strong>Duelverse</strong> no <strong>Google Chrome</strong> ou <strong>Chromium</strong></Step>
                  <Step n={2}>Clique no ícone de <strong>instalação</strong> 📥 na barra de endereço</Step>
                  <Step n={3}>Ou clique em <strong>⋮ → "Instalar Duelverse..."</strong></Step>
                  <Step n={4}>Confirme clicando em <strong>"Instalar"</strong></Step>
                  <Step n={5}>O app será adicionado ao menu de aplicativos do seu sistema</Step>
                </ol>
                <div className="p-3 bg-muted rounded-lg text-xs text-muted-foreground">
                  ⚠️ Firefox no Linux ainda não suporta instalação de PWA. Use Chrome ou Chromium.
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Notifications */}
        {isSupported && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notificações Push
              </CardTitle>
              <CardDescription>Receba alertas mesmo com o app fechado</CardDescription>
            </CardHeader>
            <CardContent>
              {!isAuthenticated ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Faça login para ativar as notificações push.
                  </p>
                  <Button onClick={() => navigate('/auth')} className="w-full" size="lg">
                    <LogIn className="mr-2 h-5 w-5" />
                    Fazer Login
                  </Button>
                </div>
              ) : hasPermission ? (
                <div className="flex items-center gap-2 p-4 bg-primary/10 rounded-lg">
                  <Check className="h-5 w-5 text-primary" />
                  <span className="text-sm">Notificações ativadas!</span>
                </div>
              ) : (
                <Button onClick={handleEnableNotifications} className="w-full" size="lg">
                  <Bell className="mr-2 h-5 w-5" />
                  Ativar Notificações
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Benefits */}
        <Card>
          <CardHeader>
            <CardTitle>Benefícios do App Instalado</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {[
                "Acesso rápido direto da tela inicial ou menu de apps",
                "Funciona offline para recursos já carregados",
                "Notificações push mesmo com app fechado",
                "Tela cheia, sem barra do navegador",
                "Carregamento mais rápido",
                "Funciona em Android, iOS, Windows e Linux",
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Button onClick={() => navigate("/")} variant="outline" className="w-full">
          Voltar para o início
        </Button>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
        {n}
      </div>
      <p>{children}</p>
    </li>
  );
}
