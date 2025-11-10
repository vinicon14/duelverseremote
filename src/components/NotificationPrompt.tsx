import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, X } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export const NotificationPrompt = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const { isSupported, isSubscribed, loading, subscribe } = usePushNotifications();

  useEffect(() => {
    const hasBeenPrompted = localStorage.getItem('notification-prompted');
    const pwaInstalled = localStorage.getItem('pwa-installed');
    
    // Só mostrar se PWA foi instalado ou após evento de instalação
    const handlePWAInstalled = () => {
      if (isSupported && !isSubscribed && !hasBeenPrompted && !loading) {
        // Mostrar prompt 2 segundos após instalação
        setTimeout(() => {
          setShowPrompt(true);
        }, 2000);
      }
    };

    // Se PWA já está instalado, verificar após 5 segundos
    if (pwaInstalled && isSupported && !isSubscribed && !hasBeenPrompted && !loading) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 5000);
      return () => clearTimeout(timer);
    }

    // Escutar evento de instalação do PWA
    window.addEventListener('pwa-installed', handlePWAInstalled);

    return () => {
      window.removeEventListener('pwa-installed', handlePWAInstalled);
    };
  }, [isSupported, isSubscribed, loading]);

  const handleSubscribe = async () => {
    const success = await subscribe();
    if (success) {
      localStorage.setItem('notification-prompted', 'true');
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('notification-prompted', 'true');
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-slide-up">
      <Card className="shadow-lg border-primary/20">
        <CardHeader className="relative pb-3">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-6 w-6"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Ative as Notificações</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <CardDescription>
            Receba notificações de mensagens, convites para duelos, notícias e torneios diretamente no seu dispositivo!
          </CardDescription>
          <div className="flex gap-2">
            <Button onClick={handleSubscribe} className="flex-1">
              Ativar
            </Button>
            <Button variant="outline" onClick={handleDismiss}>
              Agora não
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
