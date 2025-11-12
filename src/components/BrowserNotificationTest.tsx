import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, BellOff, Send } from "lucide-react";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import { useToast } from "@/components/ui/use-toast";

export const BrowserNotificationTest = () => {
  const { isSupported, hasPermission, loading, requestPermission, showNotification } = useBrowserNotifications();
  const { toast } = useToast();

  const handleTestNotification = () => {
    console.log('🧪 Test notification button clicked');
    
    toast({
      title: "Enviando notificação...",
      description: "Se você tem permissão, uma notificação do browser aparecerá",
    });
    
    showNotification('Teste de Notificação', {
      body: 'Se você está vendo isso, as notificações estão funcionando! 🎉',
      tag: 'test-notification',
    });
  };

  if (loading) return null;

  if (!isSupported) {
    return (
      <Card className="card-mystic mb-6 border-yellow-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-yellow-500" />
            <span className="text-gradient-mystic">Notificações do Browser</span>
          </CardTitle>
          <CardDescription className="text-yellow-600 dark:text-yellow-400">
            ⚠️ Notificações não estão disponíveis neste navegador
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="card-mystic mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <span className="text-gradient-mystic">Notificações do Browser</span>
        </CardTitle>
        <CardDescription>
          {hasPermission 
            ? "✅ Ativas - Você receberá notificações enquanto o app estiver aberto"
            : "⚠️ Desativadas - Ative para receber notificações"}
          {hasPermission && (
            <div className="mt-2 text-xs text-muted-foreground">
              ⚠️ Em dispositivos móveis, notificações do browser podem não funcionar como esperado. 
              Para melhor experiência, instale o app como PWA.
            </div>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row gap-2">
        {hasPermission ? (
          <>
            <Button 
              onClick={handleTestNotification}
              className="flex-1"
            >
              <Send className="mr-2 h-4 w-4" />
              Testar Notificação
            </Button>
          </>
        ) : (
          <Button onClick={requestPermission} className="w-full">
            <Bell className="mr-2 h-4 w-4" />
            Ativar Notificações
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
