import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

export const usePushNotifications = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const checkSupport = async () => {
      const supported = 'Notification' in window && 
                       'serviceWorker' in navigator && 
                       'PushManager' in window;
      setIsSupported(supported);
      
      if (supported) {
        await checkSubscriptionStatus();
      }
      setLoading(false);
    };

    checkSupport();
  }, []);

  const checkSubscriptionStatus = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error('Error checking subscription:', error);
      setIsSubscribed(false);
    }
  };

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribe = async () => {
    if (!isSupported) {
      toast({
        title: "Não suportado",
        description: "Seu navegador não suporta notificações push",
        variant: "destructive",
      });
      return false;
    }

    try {
      console.log('🔔 Solicitando permissão para notificações...');
      
      // Verificar se já temos permissão
      if (Notification.permission === 'granted') {
        console.log('✅ Já temos permissão');
      } else {
        const permission = await Notification.requestPermission();
        console.log('📋 Permissão obtida:', permission);
        
        if (permission !== 'granted') {
          toast({
            title: "Permissão negada",
            description: "Você precisa permitir notificações para recebê-las",
            variant: "destructive",
          });
          return false;
        }
      }

      console.log('🔧 Aguardando Service Worker...');
      const registration = await navigator.serviceWorker.ready;
      console.log('✅ Service Worker pronto');

      // Verificar se já existe subscrição
      let subscription = await registration.pushManager.getSubscription();
      console.log('📋 Subscrição existente?', !!subscription);

      if (!subscription) {
        console.log('📝 Criando nova subscrição...');
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        console.log('✅ Subscrição criada:', subscription.endpoint.substring(0, 50) + '...');
      }

      // Salvar subscrição no banco de dados
      console.log('💾 Salvando no banco de dados...');
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      console.log('👤 User ID:', user.id);

      const subscriptionJson = subscription.toJSON();
      console.log('📦 Subscription data:', {
        endpoint: subscription.endpoint.substring(0, 50) + '...',
        hasKeys: !!subscriptionJson.keys
      });
      
      const { data, error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint: subscription.endpoint,
          keys: subscriptionJson.keys,
        }, {
          onConflict: 'endpoint'
        })
        .select();

      if (error) {
        console.error('❌ Erro ao salvar:', error);
        throw error;
      }

      console.log('✅ Subscrição salva no banco:', data);
      
      setIsSubscribed(true);
      
      toast({
        title: "Notificações ativadas!",
        description: "Você receberá notificações mesmo com o app fechado",
      });

      return true;
    } catch (error: any) {
      console.error('❌ Erro ao ativar notificações:', error);
      console.error('Stack:', error.stack);
      
      toast({
        title: "Erro",
        description: error.message || "Não foi possível ativar as notificações",
        variant: "destructive",
      });
      return false;
    }
  };

  const unsubscribe = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        
        // Remover do banco de dados
        const { error } = await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', subscription.endpoint);

        if (error) throw error;
      }
      
      setIsSubscribed(false);
      
      toast({
        title: "Notificações desativadas",
        description: "Você não receberá mais notificações push",
      });

      return true;
    } catch (error) {
      console.error('Error disabling notifications:', error);
      toast({
        title: "Erro",
        description: "Não foi possível desativar as notificações",
        variant: "destructive",
      });
      return false;
    }
  };

  return {
    isSupported,
    isSubscribed,
    loading,
    subscribe,
    unsubscribe,
  };
};
