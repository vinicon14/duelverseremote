import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, BellOff, Send } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

export const PushNotificationTest = () => {
  const { isSupported, isSubscribed, loading, subscribe, unsubscribe, platformMessage } = usePushNotifications();
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);

  const handleTestNotification = async () => {
    setTesting(true);
    try {
      console.log('🧪 Testando notificação push...');
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      const { error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          userId: user.id,
          title: 'Teste de Notificação Push',
          body: 'Se você está vendo isso, as notificações push estão funcionando! 🎉',
          data: { type: 'test', url: '/profile' }
        }
      });

      if (error) throw error;

      toast({
        title: "Notificação enviada!",
        description: "Verifique se recebeu a notificação (pode levar alguns segundos)",
      });
    } catch (error: any) {
      console.error('❌ Erro ao testar notificação:', error);
      toast({
        title: "Erro ao enviar notificação",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return null;

  // Se não for suportado, mostrar mensagem explicativa
  if (!isSupported) {
    return (
      <Card className="card-mystic mb-6 border-yellow-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-yellow-500" />
            <span className="text-gradient-mystic">Notificações Push</span>
          </CardTitle>
          <CardDescription className="text-yellow-600 dark:text-yellow-400">
            ⚠️ {platformMessage || "Notificações push não estão disponíveis neste dispositivo"}
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
          <span className="text-gradient-mystic">Notificações Push</span>
        </CardTitle>
        <CardDescription>
          {isSubscribed 
            ? "✅ Ativas - Você receberá notificações mesmo com o app fechado"
            : "⚠️ Desativadas - Ative para receber notificações mesmo com o app fechado"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row gap-2">
        {isSubscribed ? (
          <>
            <Button 
              onClick={handleTestNotification} 
              disabled={testing}
              className="flex-1"
            >
              <Send className="mr-2 h-4 w-4" />
              {testing ? "Enviando..." : "Testar Notificação"}
            </Button>
            <Button onClick={unsubscribe} variant="outline">
              <BellOff className="mr-2 h-4 w-4" />
              Desativar
            </Button>
          </>
        ) : (
          <Button onClick={subscribe} className="w-full">
            <Bell className="mr-2 h-4 w-4" />
            Ativar Notificações Push
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
