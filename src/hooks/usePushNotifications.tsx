import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { canUsePushNotifications } from "@/utils/platformDetection";

const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

export const usePushNotifications = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [platformMessage, setPlatformMessage] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const checkSupport = async () => {
      console.log('🔍 Verificando suporte a notificações...');
      
      const { supported, reason } = canUsePushNotifications();
      console.log('📱 Plataforma suportada:', supported);
      if (reason) console.log('⚠️ Motivo:', reason);
      
      setIsSupported(supported);
      setPlatformMessage(reason);
      
      if (supported) {
        try {
          // Registrar service worker se ainda não estiver registrado
          let registration = await navigator.serviceWorker.getRegistration('/sw.js');
          
          if (!registration) {
            console.log('📝 Registrando Service Worker...');
            registration = await navigator.serviceWorker.register('/sw.js', {
              scope: '/',
              updateViaCache: 'none'
            });
            console.log('✅ Service Worker registrado');
          } else {
            console.log('✅ Service Worker já registrado');
          }
          
          await checkSubscriptionStatus();
        } catch (error) {
          console.error('❌ Erro com Service Worker:', error);
          setPlatformMessage('Erro ao registrar service worker');
        }
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
      } else {
        console.log('♻️ Reutilizando subscrição existente');
      }

      // SEMPRE salvar/atualizar subscrição no banco de dados
      console.log('💾 Salvando no banco de dados...');
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.error('❌ Usuário não autenticado!');
        throw new Error('Usuário não autenticado');
      }

      console.log('👤 User ID:', user.id);

      const subscriptionJson = subscription.toJSON();
      console.log('📦 Subscription JSON completo:', JSON.stringify(subscriptionJson, null, 2));
      console.log('📦 Endpoint:', subscription.endpoint);
      console.log('📦 Keys:', JSON.stringify(subscriptionJson.keys, null, 2));
      
      // Tentar deletar subscrição antiga primeiro
      console.log('🗑️ Deletando subscrições antigas do usuário...');
      const { error: deleteError } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id);
      
      if (deleteError) {
        console.warn('⚠️ Erro ao deletar subscrições antigas:', deleteError);
      } else {
        console.log('✅ Subscrições antigas deletadas');
      }
      
      // Inserir nova subscrição
      console.log('🚀 Inserindo nova subscrição...');
      const { data, error } = await supabase
        .from('push_subscriptions')
        .insert({
          user_id: user.id,
          endpoint: subscription.endpoint,
          keys: subscriptionJson.keys,
        })
        .select()
        .single();

      console.log('📊 Resultado da inserção:', JSON.stringify({ data, error }, null, 2));

      if (error) {
        console.error('❌ Erro ao salvar subscrição:', error);
        console.error('❌ Código do erro:', error.code);
        console.error('❌ Mensagem do erro:', error.message);
        console.error('❌ Detalhes completos:', JSON.stringify(error, null, 2));
        throw error;
      }

      console.log('✅ Subscrição salva no banco com sucesso! ID:', data?.id);
      
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
    platformMessage,
  };
};
