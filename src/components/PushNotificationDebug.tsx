import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Bell, CheckCircle, XCircle, RefreshCw, Send } from "lucide-react";

export const PushNotificationDebug = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState({
    serviceWorker: false,
    permission: 'default',
    subscription: false,
    dbSubscription: false,
  });
  const [loading, setLoading] = useState(false);
  const [subscriptionData, setSubscriptionData] = useState<any>(null);

  const checkStatus = async () => {
    try {
      // Check Service Worker
      const swRegistration = await navigator.serviceWorker.getRegistration();
      setStatus(prev => ({ ...prev, serviceWorker: !!swRegistration }));

      // Check Permission
      setStatus(prev => ({ ...prev, permission: Notification.permission }));

      // Check Browser Subscription
      if (swRegistration) {
        const subscription = await swRegistration.pushManager.getSubscription();
        setStatus(prev => ({ ...prev, subscription: !!subscription }));
        setSubscriptionData(subscription);

        // Check DB Subscription
        if (subscription) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data, error } = await supabase
              .from('push_subscriptions')
              .select('*')
              .eq('user_id', user.id);
            
            setStatus(prev => ({ ...prev, dbSubscription: data && data.length > 0 }));
          }
        }
      }
    } catch (error) {
      console.error('Error checking status:', error);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const requestPermission = async () => {
    const permission = await Notification.requestPermission();
    toast({
      title: permission === 'granted' ? 'Permissão concedida' : 'Permissão negada',
      description: `Status: ${permission}`,
    });
    checkStatus();
  };

  const registerServiceWorker = async () => {
    try {
      setLoading(true);
      await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none'
      });
      toast({
        title: 'Service Worker registrado',
        description: 'Service Worker está pronto',
      });
      checkStatus();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const subscribe = async () => {
    try {
      setLoading(true);
      
      if (Notification.permission !== 'granted') {
        await requestPermission();
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const subscriptionJson = subscription.toJSON();
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint: subscription.endpoint,
          keys: subscriptionJson.keys,
        }, {
          onConflict: 'endpoint'
        });

      if (error) throw error;

      toast({
        title: 'Inscrito com sucesso',
        description: 'Push notifications ativadas',
      });
      
      checkStatus();
    } catch (error: any) {
      toast({
        title: 'Erro ao inscrever',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const sendTestNotification = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const { error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          userId: user.id,
          title: '🧪 Teste de Debug',
          body: 'Notificação de teste do painel de debug! 🚀',
          data: {
            type: 'test',
            url: '/',
          },
        },
      });

      if (error) throw error;

      toast({
        title: 'Teste enviado',
        description: 'Verifique se a notificação apareceu',
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Debug de Push Notifications
        </CardTitle>
        <CardDescription>
          Status do sistema de notificações e ferramentas de teste
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span>Service Worker</span>
            {status.serviceWorker ? (
              <Badge variant="default" className="gap-1">
                <CheckCircle className="h-3 w-3" />
                Ativo
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                Inativo
              </Badge>
            )}
          </div>
          
          <div className="flex items-center justify-between">
            <span>Permissão</span>
            <Badge variant={status.permission === 'granted' ? 'default' : 'secondary'}>
              {status.permission}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between">
            <span>Subscription (Browser)</span>
            {status.subscription ? (
              <Badge variant="default" className="gap-1">
                <CheckCircle className="h-3 w-3" />
                Ativa
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                Inativa
              </Badge>
            )}
          </div>
          
          <div className="flex items-center justify-between">
            <span>Subscription (Database)</span>
            {status.dbSubscription ? (
              <Badge variant="default" className="gap-1">
                <CheckCircle className="h-3 w-3" />
                Salva
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                Não Salva
              </Badge>
            )}
          </div>
        </div>

        {subscriptionData && (
          <div className="p-3 bg-muted rounded-lg text-xs">
            <div className="font-mono break-all">
              Endpoint: {subscriptionData.endpoint.substring(0, 60)}...
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button onClick={checkStatus} variant="outline" disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar Status
          </Button>

          {!status.serviceWorker && (
            <Button onClick={registerServiceWorker} disabled={loading}>
              Registrar Service Worker
            </Button>
          )}

          {status.permission !== 'granted' && (
            <Button onClick={requestPermission} disabled={loading}>
              Solicitar Permissão
            </Button>
          )}

          {!status.subscription && status.permission === 'granted' && (
            <Button onClick={subscribe} disabled={loading}>
              <Bell className="h-4 w-4 mr-2" />
              Inscrever para Notificações
            </Button>
          )}

          {status.subscription && status.dbSubscription && (
            <Button onClick={sendTestNotification} disabled={loading}>
              <Send className="h-4 w-4 mr-2" />
              Enviar Notificação de Teste
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
