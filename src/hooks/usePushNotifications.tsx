import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

export const usePushNotifications = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Check if push notifications are supported
  useEffect(() => {
    const checkSupport = async () => {
      const supported = 
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;
      
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
    }
  };

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
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
      console.log('🔔 Iniciando subscrição de notificações...');
      
      // Request notification permission
      const permission = await Notification.requestPermission();
      console.log('📋 Permissão:', permission);
      
      if (permission !== 'granted') {
        toast({
          title: "Permissão negada",
          description: "Você precisa permitir notificações para recebê-las",
          variant: "destructive",
        });
        return false;
      }

      // Wait for service worker to be ready (PWA auto-registers it)
      console.log('⏳ Aguardando service worker...');
      const registration = await navigator.serviceWorker.ready;
      console.log('✅ Service worker pronto:', registration);

      // VAPID public key
      const vapidPublicKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

      // Subscribe to push notifications
      console.log('📲 Criando subscrição push...');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      });
      console.log('✅ Subscrição criada:', subscription.endpoint);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.error('❌ Erro ao obter usuário:', userError);
        throw new Error('Você precisa estar autenticado para ativar notificações');
      }

      console.log('👤 Usuário autenticado:', user.id);

      // Save subscription to database
      const subscriptionJson = subscription.toJSON();
      console.log('💾 Salvando subscrição no banco...');
      
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint: subscription.endpoint,
          keys: subscriptionJson.keys,
        }, {
          onConflict: 'user_id,endpoint'
        });

      if (error) {
        console.error('❌ Erro ao salvar subscrição:', error);
        throw error;
      }

      console.log('✅ Subscrição salva com sucesso!');
      setIsSubscribed(true);
      
      toast({
        title: "Notificações ativadas",
        description: "Você receberá notificações no seu dispositivo",
      });

      return true;
    } catch (error) {
      console.error('❌ Erro ao ativar notificações:', error);
      
      let errorMessage = "Não foi possível ativar as notificações";
      
      if (error instanceof Error) {
        if (error.message.includes('autenticado')) {
          errorMessage = error.message;
        } else if (error.message.includes('subscription')) {
          errorMessage = "Erro ao criar subscrição push. Tente novamente.";
        }
      }
      
      toast({
        title: "Erro",
        description: errorMessage,
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
        
        // Remove from database
        const { error } = await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', subscription.endpoint);

        if (error) throw error;

        setIsSubscribed(false);
        
        toast({
          title: "Notificações desativadas",
          description: "Você não receberá mais notificações",
        });
      }
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error);
      toast({
        title: "Erro",
        description: "Não foi possível desativar as notificações",
        variant: "destructive",
      });
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
