import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Smartphone, Check, Bell, LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function InstallApp() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { isSupported, hasPermission, requestPermission } = useBrowserNotifications();
  const { toast } = useToast();

  useEffect(() => {
    // Check authentication status
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
      setLoading(false);
    };

    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    // Listen for beforeinstallprompt event
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
      toast({
        title: "Instalação não disponível",
        description: "Abra este site no Chrome ou Safari para instalar o app",
        variant: "destructive",
      });
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
      toast({
        title: "App instalado!",
        description: "O Duelverse foi instalado na sua tela inicial",
      });
    }

    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  const handleEnableNotifications = async () => {
    const success = await requestPermission();
    if (success) {
      toast({
        title: "Notificações ativadas!",
        description: "Você receberá notificações enquanto o app estiver aberto",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-6 w-6" />
              Instalar Duelverse
            </CardTitle>
            <CardDescription>
              Instale o app na sua tela inicial para uma experiência completa
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isInstalled ? (
              <div className="flex items-center gap-2 p-4 bg-primary/10 rounded-lg">
                <Check className="h-5 w-5 text-primary" />
                <span className="text-sm">App já instalado!</span>
              </div>
            ) : isInstallable ? (
              <Button onClick={handleInstall} className="w-full" size="lg">
                <Download className="mr-2 h-5 w-5" />
                Instalar App
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Para instalar o app na sua tela inicial:
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                      1
                    </div>
                    <p>
                      <strong>iPhone/Safari:</strong> Toque no botão de compartilhar{" "}
                      <span className="inline-block">📤</span> e depois em "Adicionar à Tela de Início"
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                      2
                    </div>
                    <p>
                      <strong>Android/Chrome:</strong> Toque no menu (⋮) e depois em "Instalar aplicativo"
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {isSupported && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-6 w-6" />
                Notificações Push
              </CardTitle>
              <CardDescription>
                Receba notificações mesmo com o app fechado
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isAuthenticated ? (
                <div className="space-y-3">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      Para ativar as notificações push, você precisa fazer login primeiro.
                    </p>
                  </div>
                  <Button 
                    onClick={() => navigate('/auth')} 
                    className="w-full" 
                    size="lg"
                  >
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

        <Card>
          <CardHeader>
            <CardTitle>Benefícios do App Instalado</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5" />
                <span>Acesso rápido direto da tela inicial</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5" />
                <span>Funciona offline para recursos já carregados</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5" />
                <span>Notificações push mesmo com app fechado</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5" />
                <span>Experiência de tela cheia, sem barra do navegador</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5" />
                <span>Carregamento mais rápido</span>
              </li>
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
