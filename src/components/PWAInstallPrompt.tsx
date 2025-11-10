import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, X, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAInstallPrompt = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detectar iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Verificar se já foi instalado
    const isInstalled = localStorage.getItem('pwa-installed');
    const promptDismissed = localStorage.getItem('pwa-prompt-dismissed');
    
    // Verificar se está rodando como PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    
    if (isInstalled || promptDismissed || isStandalone) {
      return;
    }

    // Para Android/Chrome - capturar evento beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Mostrar prompt após 3 segundos
      setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Para iOS - mostrar instruções após 3 segundos se não foi instalado
    if (iOS && !isStandalone) {
      setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // Se não há prompt (iOS), apenas marcar e fechar
      localStorage.setItem('pwa-prompt-dismissed', 'true');
      setShowPrompt(false);
      return;
    }

    // Mostrar prompt de instalação nativo
    await deferredPrompt.prompt();
    
    // Aguardar escolha do usuário
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      localStorage.setItem('pwa-installed', 'true');
      // Disparar evento customizado para mostrar prompt de notificação
      window.dispatchEvent(new Event('pwa-installed'));
    }
    
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa-prompt-dismissed', 'true');
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in">
      <Card className="max-w-md mx-4 shadow-2xl border-primary/20">
        <CardHeader className="relative pb-3">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-6 w-6"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-primary/10">
              <Smartphone className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">Instalar Duelverse</CardTitle>
              <CardDescription className="text-xs mt-1">
                Melhor experiência no seu dispositivo
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isIOS ? (
            <>
              <div className="space-y-2 text-sm">
                <p className="font-medium">Para instalar no iOS:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Toque no botão de compartilhar <span className="inline-block">⎙</span></li>
                  <li>Role para baixo e toque em "Adicionar à Tela de Início"</li>
                  <li>Toque em "Adicionar"</li>
                </ol>
              </div>
              <Button onClick={handleDismiss} className="w-full">
                Entendi
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  • Acesso rápido da tela inicial
                </p>
                <p className="text-sm text-muted-foreground">
                  • Funciona offline
                </p>
                <p className="text-sm text-muted-foreground">
                  • Notificações em tempo real
                </p>
                <p className="text-sm text-muted-foreground">
                  • Experiência completa de app
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleInstall} className="flex-1 gap-2">
                  <Download className="h-4 w-4" />
                  Instalar App
                </Button>
                <Button variant="outline" onClick={handleDismiss}>
                  Agora não
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
